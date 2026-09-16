# X++ Transpiler for Dynamics 365 F&O

Leé el código X++ de tus metadatos de Dynamics 365 Finance & Operations sin
pelearte con el XML.

Un repositorio de metadatos de D365FO guarda el código dentro de los XML de cada
artefacto, repartido en bloques `CDATA`. Revisar un pull request así es
incómodo. Esta extensión reconstruye el `.xpp` equivalente y lo abre al lado del
XML, con resaltado de sintaxis.

## Características

**Vista X++ de cualquier artefacto.** `Ctrl+Alt+X` sobre un XML de metadatos y
se abre el código reconstruido. Es un documento virtual de solo lectura: no se
escribe nada al disco, así que el repositorio de metadatos no se llena de
archivos generados.

**Reconstrucción completa de formularios.** Los métodos de un formulario están
repartidos en cuatro niveles del XML —el formulario, sus orígenes de datos, los
campos de cada origen y los controles—. Se recuperan todos, anidados como los
muestra el editor de Visual Studio.

**Exportación a `.xpp`.** De un archivo, o de un árbol de módulos completo.

**Control de cuándo aparece.** La apertura automática viene desactivada. Si se
activa, puede limitarse por tipo de artefacto o por ruta, y pausarse con un clic
desde la barra de estado.

Soporta `AxClass`, `AxTable`, `AxForm`, `AxQuery`, `AxView` y
`AxDataEntityView`. Los artefactos sin código —`AxEnum`, `AxEdt`, las
extensiones `Ax*Extension`— se reportan como vacíos, no como error.

## Uso

| Comando | Atajo | Qué hace |
|---|---|---|
| **X++: Ver como X++** | `Ctrl+Alt+X` | Desde el XML abre la vista; desde la vista vuelve al XML |
| **X++: Exportar a archivo .xpp** | — | Guarda el X++ donde elijas |
| **X++: Exportar carpeta de metadatos a .xpp** | — | Exporta un árbol entero, agrupado por tipo |
| **X++: Pausar o reanudar la apertura automática** | — | Pausa la apertura automática por lo que dure la sesión |

Los dos primeros también están como botones en la barra de título del editor: el
de ver, sobre el XML; el de exportar, sobre la vista X++.

## Configuración

### Cuándo se abre la vista

| Opción | Por defecto | Qué controla |
|---|---|---|
| `xpp.transpile.autoPreview` | `never` | `never` · `ask` (avisa sin robar el foco) · `onOpen` |
| `xpp.transpile.autoPreviewTypes` | `[]` | Limitar a ciertos tipos, p. ej. `["AxClass","AxForm"]` |
| `xpp.transpile.include` | `[]` | Globs de rutas donde se permite. Vacío = en todas partes |
| `xpp.transpile.exclude` | `[]` | Globs donde nunca. Tiene prioridad sobre `include` |
| `xpp.transpile.skipEmpty` | `true` | No abrir artefactos sin código |

### Dónde aparece

| Opción | Por defecto | Qué controla |
|---|---|---|
| `xpp.transpile.viewColumn` | `beside` | `beside` · `active` · `replace` |
| `xpp.transpile.preserveFocus` | `true` | Dejar el cursor en el XML cuando se abre al lado |

### Qué se genera

| Opción | Por defecto | Qué controla |
|---|---|---|
| `xpp.transpile.eol` | `crlf` | Fin de línea del X++ generado |
| `xpp.transpile.stripDocComments` | `false` | Quitar los comentarios `///` |
| `xpp.transpile.headerComment` | `false` | Cabecera con tipo, nombre y procedencia |
| `xpp.transpile.outputDirectory` | *(vacío)* | Carpeta destino de las exportaciones |

### El indicador de la barra de estado

Muestra si la vista se va a abrir sola, y lo cambia con un clic:

| Indicador | Significa | Un clic |
|---|---|---|
| `X++` | La apertura automática está desactivada | Abre la vista |
| `X++ auto` | Está activa | La pausa |
| `X++ preguntar` | Modo `ask` | La pausa |
| `X++ pausado` | Pausada en esta sesión | La reanuda |

La pausa dura lo que dure la sesión: no modifica la configuración.

## Requisitos

Ninguno. La extensión lee los XML directamente: no necesita tener instaladas las
herramientas de desarrollo de D365FO ni ningún componente adicional.

## Problemas conocidos

- **La vista es de solo lectura.** Editar el X++ y que se escriba de vuelta al
  XML no está soportado.
- Los artefactos con `<UnparsableSource>` —código que D365FO no pudo parsear— se
  muestran tal cual vienen, sin reconstruir.

## Cómo funciona

El detalle de la reconstrucción —cómo se arman los formularios, qué tipos usan
`<Declaration>` y cuáles no, cómo se verifica— está en
[`docs/como-funciona.md`](docs/como-funciona.md).

## Contribuir

Ver [`CONTRIBUTING.md`](CONTRIBUTING.md). Los tests corren con `npm test`, sin
necesidad de abrir VS Code.

## Notas de la versión

Ver [`CHANGELOG.md`](CHANGELOG.md).

## Licencia

MIT. Ver [`LICENSE`](LICENSE).
