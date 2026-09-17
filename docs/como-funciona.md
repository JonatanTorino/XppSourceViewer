# Cómo funciona la reconstrucción

## El código X++ ya está en el XML

Vale la pena empezar por acá, porque no es evidente: el XML de un artefacto de
D365FO **no guarda el código compilado ni codificado**. Lo guarda como texto, en
bloques `CDATA`:

```xml
<AxClass>
  <Name>DemoEventSubscriber</Name>
  <SourceCode>
    <Declaration><![CDATA[
internal final class DemoEventSubscriber
{
}
]]></Declaration>
    <Methods>
      <Method>
        <Name>increment</Name>
        <Source><![CDATA[
    public void increment()
    {
        counter++;
    }
]]></Source>
      </Method>
    </Methods>
  </SourceCode>
</AxClass>
```

Reconstruir el `.xpp` es juntar esos bloques y rearmar las llaves de la clase.
No hace falta compilar nada, ni ningún componente de Microsoft.

## Tipos de artefacto

El recorrido del XML es genérico, así que no hay una lista blanca. Estos son los
que llevan código en un repositorio de D365FO:

| Tipo | Dónde declara la clase | Métodos anidados |
|---|---|---|
| `AxClass` | `<Declaration>` | — |
| `AxTable` | `<Declaration>` | — |
| `AxView` | `<Declaration>` | — |
| `AxDataEntityView` | `<Declaration>` | — |
| `AxForm` | método `classDeclaration` | orígenes de datos, campos y controles |
| `AxQuery` | método `classDeclaration` | — |

Los artefactos puramente declarativos —`AxEnum`, `AxEdt`, `AxMenuItem*`, las
extensiones `Ax*Extension`— no llevan código y se reportan como vacíos, no como
error.

Notar que **no todos los tipos declaran la clase igual**: formularios y consultas
no usan `<Declaration>` sino un método llamado `classDeclaration`.

## Formularios: el caso que más se presta a equivocarse

D365FO reparte los métodos de un formulario en cuatro niveles del XML, y el
editor de Visual Studio los presenta como clases anidadas decoradas con un
atributo:

```
SourceCode/Methods/Method                              -> métodos del formulario
SourceCode/DataSources/DataSource/Methods              -> [DataSource] class <Nombre>
SourceCode/DataSources/DataSource/Fields/Field/Methods -> [DataField]  class <Campo>
SourceCode/DataControls/Control/Methods                -> [Control('<Tipo>')] class <Control>
```

Leer solo el nivel raíz descarta los otros tres **en silencio**: el `.xpp`
generado sigue pareciendo correcto, solo que le faltan métodos. Sobre un
repositorio de referencia de 7 módulos, eso es perder 106 métodos de 1.474.

El resultado completo tiene esta forma:

```xpp
[Form]
public class DemoCatalogForm extends FormRun
{
    public void init()
    {
        super();
    }

    [DataSource]
    class DemoTable
    {
        public int active()
        {
            return super();
        }

        [DataField]
        class SourceLocation
        {
            public void modified()
            {
                super();
            }
        }
    }

    [Control('TabPage')]
    class OverviewTabPage
    {
        public void pageActivated()
        {
            super();
        }
    }
}
```

## La sangría no se calcula

Los bloques `CDATA` **ya vienen sangrados** al nivel que les corresponde: 4
espacios para un método del artefacto, 8 para uno de un origen de datos o un
control, 12 para uno de un campo. El emisor solo agrega las líneas de apertura y
cierre de cada clase anidada en el nivel correcto, y copia el código verbatim.

Eso tiene una consecuencia práctica: **el texto del método no se toca**. Lo que
se ve en la vista X++ es byte por byte lo que está en el XML.

## `ViewMetadata` no forma parte de la clase

Un `AxDataEntityView` lleva, además de su propio `<SourceCode>`, un
`ViewMetadata/SourceCode` con la consulta embebida:

```xpp
[Query]
public class Metadata extends QueryRun
{
}
```

Es **otra unidad de compilación**. Incluirla en la clase de la entidad genera
X++ que no compila. Por eso solo se lee el `<SourceCode>` que es hijo directo de
la raíz.

## Exportar una carpeta entera

El comando de carpeta recorre el árbol y escribe un `.xpp` por cada XML que
traiga código. Antes de empezar pregunta cómo ordenar la salida, con dos modos:

| Modo | Resultado |
|---|---|
| `mirror` | `out/MiModulo/AxClass/Foo.xpp` — el mismo árbol que el origen |
| `byType` | `out/AxClass/Foo.xpp` — una carpeta por tipo, aplanado |
| `xppSource` | `out/MiModelo/AxClass_Foo.xpp` — una carpeta por modelo, tipo como prefijo |

`xppSource` existe para depurar. Un paquete desplegado como binarios no trae
fuentes, así que el depurador no tiene adónde entrar: con las fuentes dispuestas
de esta forma las encuentra, y el X++ de un paquete binario pasa a ser
depurable. Es la única de las tres disposiciones que habilita algo que de otro
modo no se puede hacer.

El prefijo del tipo no es decorativo, y es consecuencia de lo anterior: como
todo el modelo cae en una sola carpeta, sin el prefijo una clase y un formulario
que se llamen igual escribirían sobre el mismo archivo.

El modelo se deduce de la ubicación. Un repositorio de metadatos guarda cada
artefacto en `<Paquete>/<Modelo>/<Tipo>/<Nombre>.xml`, así que el modelo es la
carpeta que contiene a la del tipo. Solo se sube ese nivel cuando la carpeta que
contiene al archivo es efectivamente la del tipo: si el árbol no sigue la
convención, subir a ciegas tomaría como modelo algo que no lo es.

Se pregunta en vez de configurarse porque la respuesta depende de para qué es la
exportación y no de una preferencia estable: espejar sirve para comparar contra
el repositorio de origen, y agrupar por tipo sirve para leer todos los artefactos
de una clase de corrido.

Las carpetas se crean recién al escribir un archivo. Por eso un directorio del
origen cuyos XML no tengan código X++ —tablas de staging, enums, extensiones
puramente declarativas— no deja una carpeta vacía del otro lado: la estructura
que se reproduce es la de lo que efectivamente se generó, no la del origen
completo.

Se saltean `bin`, `XppMetadata` y `Descriptor`, que son salida del build.
`XppMetadata` en particular trae firmas de métodos sin cuerpo, así que incluirla
generaría archivos que parecen código y no lo son.

El cálculo de la ruta destino vive en `src/exportLayout.ts`, fuera de la capa de
VS Code y con tests propios: es aritmética de rutas —separadores de Windows,
rutas relativas, el archivo que cuelga de la raíz— y es fácil de equivocar.

## Verificación

Dos invariantes, que se aplican a todos los fixtures y a repositorios reales:

1. Cada bloque `<Source>` aparece en la salida tantas veces como bloques con ese
   texto haya en el XML.
2. Las llaves del X++ generado quedan balanceadas.

Miran justamente lo que "la salida se ve bien" no detecta. La primera se cuenta
por texto distinto y no por bloque, porque dos métodos de contenedores distintos
pueden tener cuerpos idénticos —un `modified()` que solo llama a `super()`, por
ejemplo— y entonces lo correcto es que ese texto aparezca dos veces.

Resultado sobre un repositorio real de 7 módulos, 1.084 archivos:

```
artefactos de metadatos   1059
  con código X++           483
  sin código (vacíos)      576
métodos perdidos             0
métodos duplicados           0
llaves desbalanceadas        0
excepciones                  0
métodos recuperados       1474
```

## Por qué no se usa la API de metadatos de Microsoft

Existe una API oficial para leer metadatos de D365FO, y funciona. Se probó y se
descartó porque devuelve exactamente el mismo texto, a cambio de unos 150 MB de
binarios y un proceso .NET auxiliar. El detalle, con el experimento
reproducible, está en [`metadata-api.md`](metadata-api.md).
