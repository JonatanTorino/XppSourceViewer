# El Language Server de X++: investigación

> **Estado: no implementado.** Este documento no describe una función de la
> extensión. Es el registro de una investigación, para que quien quiera retomarla
> no tenga que empezar de cero.

La extensión reconstruye código X++ leyendo el XML. Eso no requiere ningún
componente de Microsoft, y por eso la v0.1.0 no incluye nada relacionado con el
Language Server: instalar unos 150 MB de binarios para una función que todavía no
arranca no le sirve a nadie.

Lo que sigue es lo que se averiguó por si alguna vez se agrega IntelliSense,
diagnósticos o ir-a-definición sobre X++.

## El Language Server no transpila

Conviene despejarlo primero, porque es la confusión más natural: el `.vsix` de
las herramientas de D365FO trae un ejecutable de language server, y uno asume que
convierte archivos.

No lo hace, y no puede. **LSP es un protocolo JSON-RPC** para funciones de editor
—`textDocument/completion`, `textDocument/hover`, `textDocument/definition`—. No
tiene ninguna operación con la forma "convertí este archivo". Un language server
responde preguntas sobre código que el editor ya tiene abierto; no produce
archivos.

## Dónde están los componentes

Los plugins que se descargan con los metadatos de un entorno UDE dejan las
versiones en:

```
%LOCALAPPDATA%\Microsoft\Dynamics365\
    10.0.XXXX.YYY\
        Microsoft.Dynamics.FinOps.ToolsVS2022.vsix   (~112 MB, 631 entradas)
        PackagesLocalDirectory\                       (metadatos de los módulos)
```

El `.vsix` es un ZIP. Las partes que importan:

| Ruta dentro del paquete | Qué es |
|---|---|
| `Microsoft.Dynamics.LSP.XppLanguageServer.exe` | El servidor. 53 KB: es solo el arranque |
| `Microsoft.Dynamics.LSP.XppLanguageServer.exe.config` | Redirecciones de ensamblados y ruta de sondeo |
| `LanguageServerDependencies/` | OmniSharp LSP, `Microsoft.Dynamics.Parsecs.CodeAnalysis.Xpp`, `CommandLine.dll` |
| `Microsoft.Dynamics.AX.Framework.Xlnt.*` | Parser de X++, modelo de tipos, XReference |
| `xppc.dll` | El compilador |

## Lo que bloquea la implementación

Falta **el contrato de arranque**: con qué argumentos espera que lo lancen.

Descartado como fuente:

- **El `.exe.config`.** Se extrajo y se leyó. Son 12.697 bytes, todos
  redirecciones de ensamblados más
  `<probing privatePath="LanguageServerDependencies" />`. Ni una pista sobre la
  línea de comandos.
- **Extensiones de VS Code preexistentes.** Las que hay lanzan un ejecutable
  distinto y más viejo, de las herramientas para Visual Studio 2015. El actual
  está construido sobre OmniSharp; copiar aquellas opciones sería adivinar.

Lo que sugiere el paquete, sin confirmar:

- `CommandLine.dll` (CommandLineParser) implica que el servidor **espera
  argumentos**, y probablemente rechace o ignore un arranque sin ellos.
- `OmniSharp.Extensions.LanguageServer` suele ofrecer `--stdio` y named pipes,
  elegidos por argumento.
- Casi seguro necesita que se le indique dónde está `PackagesLocalDirectory`: sin
  los metadatos no puede resolver ni un tipo.

Arrancar el proceso a ciegas produce un servidor que no responde y un error
difícil de diagnosticar.

## Cómo confirmarlo

En orden de costo:

1. Ejecutar el `.exe` con `--help` en una consola y leer lo que imprima
   CommandLineParser.
2. Inspeccionar el `pkgdef` o el `extension.vsixmanifest` del paquete, a ver si
   la extensión de Visual Studio declara cómo lo lanza.
3. Descompilar el ejecutable: son 53 KB, prácticamente solo el `Main`.
4. Observar con Process Monitor la línea de comandos real cuando Visual Studio lo
   arranca.

## Si se implementa

Hay dos restricciones que conviene respetar desde el principio:

- **Los binarios no deberían viajar en el paquete.** Son propietarios de
  Microsoft y pesan unos 150 MB. Lo razonable es descubrir la instalación local
  del usuario y extraer a `globalStorage` lo que haga falta.
- **El transpilador no debería depender de esto.** Hoy son independientes, y
  conviene que siga siendo así: la extensión tiene que funcionar en un equipo sin
  D365FO instalado.
