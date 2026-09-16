# La API oficial de metadatos de D365FO

Este documento registra una investigación cuyo resultado fue **no cambiar nada**.
Vale la pena conservarlo porque la pregunta que lo originó es la primera que se
le ocurre a cualquiera que mire este proyecto:

> Si Microsoft distribuye componentes para X++, ¿no habría que usarlos para
> convertir los XML en `.xpp`, en vez de parsear el XML a mano?

La respuesta corta: **la API oficial existe, funciona, y devuelve exactamente el
mismo texto**. Comprobado, no supuesto.

## Lo primero: el Language Server no es esa API

Es la confusión más natural, porque el `.vsix` de las herramientas de D365FO trae
un `XppLanguageServer.exe` y uno asume que convierte archivos.

No lo hace, y no puede: **LSP es un protocolo JSON-RPC** para funciones de
editor —`textDocument/completion`, `textDocument/hover`,
`textDocument/definition`—. No tiene ninguna operación con la forma "convertí
este archivo". Un language server responde preguntas sobre código que el editor
ya tiene abierto; no produce archivos.

Una extensión puede perfectamente arrancar un language server *y* además
convertir archivos, pero son dos cosas independientes que no se cruzan: el
servidor da IntelliSense sobre el editor abierto, y la conversión es análisis de
texto sobre el XML. Que convivan en el mismo paquete no las vuelve la misma
función.

## La API oficial sí existe

Es el proveedor de metadatos, no el language server:

```
Microsoft.Dynamics.AX.Metadata.Storage.dll
  └─ MetadataProviderFactory
       └─ CreateDiskProvider(string metadataDirectoryPath) : IDiskMetadataProvider
            ├─ .Classes.Read(name)  : AxClass
            ├─ .Forms.Read(name)    : AxForm
            └─ .Tables.Read(name)   : AxTable
```

`docs/probe-metadata-api.ps1` la ejercita de punta a punta. Ejemplo:

```powershell
.\docs\probe-metadata-api.ps1 `
    -BinPath      'C:\ruta\a\los\binarios\de\D365FO' `
    -MetadataPath 'C:\AOSService\PackagesLocalDirectory' `
    -ClassName    MiClase `
    -FormName     MiFormulario
```

### Las cuatro trampas

Cada una costó un intento fallido:

1. **`MetadataProviderFactory` se instancia.** Sus métodos `Create*` son de
   **instancia**, no estáticos. `[MetadataProviderFactory]::CreateDiskProvider(...)`
   falla con *"does not contain a method named 'CreateDiskProvider'"*.

2. **Los métodos cuelgan de `$cls.Methods`, no de `$cls.SourceCode.Methods`.**
   Esta es la que más desorienta, porque en el XML el camino **sí** es
   `SourceCode/Methods/Method`. En el modelo de objetos, `AxClass.SourceCode` es
   un `AxPropertyCollection` —otra cosa— y su `.Methods` da `Count = 0` sin
   error. El código está en `AxClass.Methods`.

3. **`CreateDiskProviderFull` no sirve para leer.** Devuelve un provider cuyo
   `Classes.Read()` lanza *"Specified method is not supported."* La que hay que
   usar es `CreateDiskProvider`.

4. **El resolver de ensamblados tiene que cachear los fallos.** `LoadFrom`
   dispara `AssemblyResolve` otra vez, y sin guarda el proceso muere por
   `StackOverflowException`.

### Qué devuelve

Para una clase, el texto verbatim:

```
-- metodos: 1 --
--- registerKeys ---
    /// <summary>
    /// registerKeys
    /// </summary>
    [SubscribesTo(classStr(DemoDiscoveryService), delegateStr(DemoDiscoveryService, registerKeys))]
    public static void registerKeys(Set _keys)
    {
        _keys.add(configurationKeyNum(DemoExtension));
    }
```

Es exactamente el texto que está dentro del `CDATA` del XML. Se puede comprobar
contra `test/fixtures/xml/AxClass.Demo.xml`, que tiene esa misma forma.

Para un formulario, la misma estructura anidada que el transpilador reconstruye:

```
metodos del formulario: 2
  - classDeclaration
  - init
origenes de datos: 8
  DataSource DemoTable -> metodos: 0, campos: 17
    Field SourceLocation -> metodos: 2
      - lookupReference
      - modified
```

Ese `Field SourceLocation` con dos métodos es justamente el anidamiento que un
lector que solo mire el nivel raíz descarta sin avisar.

## Por qué el transpilador no la usa

**Porque el resultado es el mismo.** El texto que devuelve
`AxClass.Methods[n].Source` es idéntico al que está en el bloque `CDATA` del
XML, y tiene que serlo: la API también lee esos mismos archivos del disco. El
X++ no está compilado ni codificado en el XML; está escrito tal cual.

Dado que la salida no cambia, lo que queda es comparar el costo:

| | Lectura del XML *(lo que hacemos)* | API oficial |
|---|---|---|
| Dependencias | `@xmldom/xmldom` | ~150 MB de binarios de Microsoft |
| Proceso | dentro de la extensión | proceso .NET auxiliar; Node no carga .NET |
| Plataforma | cualquiera | Windows, .NET Framework |
| Sin D365FO instalado | funciona | no funciona |
| Tests en CI | corren | no corren sin los binarios |
| Redistribución | sin problema | no se pueden redistribuir |
| Velocidad | milisegundos | carga el almacén de metadatos completo |

Donde la API **sí** aporta algo es en resolver el *modelo*, no el código: para el
formulario del ejemplo devolvió 8 orígenes de datos con todos sus campos,
mientras que el XML solo guarda los que tienen código. Eso importaría para
analizar el modelo —qué campos tiene una tabla, qué extiende qué—, que no es lo
que hace esta extensión.

## Cuándo reconsiderarlo

Si el proyecto crece hacia analizar el modelo y no solo a extraer código:
resolver extensiones (`Ax*Extension`) contra su objeto base, listar los campos
reales de una tabla, seguir herencias. Ahí la API oficial deja de ser equivalente
y pasa a ser la opción correcta.

El diseño ya lo contempla: `src/transpiler/index.ts` expone una sola función
—`transpile(xml)`— y nada fuera de `src/transpiler/` sabe cómo se obtiene el
código. Agregar un segundo backend es agregar un módulo hermano, no reescribir
la extensión.
