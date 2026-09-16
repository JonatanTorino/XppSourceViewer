# Registro de cambios

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
versionado es [semántico](https://semver.org/lang/es/).

## [0.1.0] - 2026-09-16

Primera versión.

### Agregado

- Transpilador de XML de metadatos de D365FO a X++, con recorrido recursivo que
  recupera los métodos de todos los niveles de anidamiento: el artefacto, sus
  orígenes de datos, los campos de cada origen y los controles.
- Vista virtual de solo lectura con el X++ de un artefacto, que se regenera al
  guardar el XML de origen. No se escribe nada al disco salvo que se pida.
- Exportación a `.xpp` de un archivo o de un árbol de módulos completo.
- Control de cuándo se abre la vista: modos `never` / `ask` / `onOpen`, filtros
  por tipo de artefacto y por glob de ruta, y omisión de artefactos sin código.
- Control de dónde aparece: `viewColumn` y `preserveFocus`.
- Indicador en la barra de estado que pausa y reanuda la apertura automática
  para la sesión, y `Ctrl+Alt+X` para alternar entre el XML y su vista.
- Opciones de emisión: quitar los comentarios `///` y anteponer una cabecera con
  la procedencia del código.
- Gramática TextMate y configuración del lenguaje X++.
- 47 tests sobre invariantes estructurales, ejecutables sin VS Code.
