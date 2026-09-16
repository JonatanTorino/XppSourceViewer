# Cómo trabajar en este proyecto

## Puesta en marcha

```bash
npm install
npm run compile
npm test
```

`F5` abre una ventana de VS Code con la extensión cargada. Elegí la
configuración *"Ejecutar sobre los fixtures"* para tener algo que mirar sin
necesidad de un repositorio de metadatos a mano.

## Estructura

```
src/
  transpiler/        El conversor. NO importa `vscode`.
    types.ts         Modelo de datos y opciones.
    walker.ts        Recorrido recursivo del XML.
    emitter.ts       Emisión del texto X++.
    index.ts         API pública: transpile(xml, options).
  commands/          Comandos. Acá sí entra `vscode`.
  config.ts          Lectura de la configuración, en un solo lugar.
  statusBar.ts       Indicador y pausa de la apertura automática.
  logger.ts
  extension.ts       Punto de entrada.
test/
  fixtures/xml/      XML anonimizados, uno por forma estructural.
  transpiler.test.ts
```

### La regla que sostiene el diseño: `src/transpiler/` no importa `vscode`

Por eso los tests corren con `node --test`, sin arrancar el editor, en menos de
un segundo. Es fácil de respetar y conviene hacerlo: en cuanto un módulo del
transpilador importe `vscode`, deja de poder probarse así.

`tsconfig.core.json` compila justamente ese subconjunto y es lo que usa
`npm test`.

## Tests

```bash
npm test                              # compila el núcleo y corre todo
node --test "out/test/*.test.js"      # sin recompilar
```

Las dos invariantes que importan están en el encabezado de
`test/transpiler.test.ts`:

1. Cada bloque `<Source>` aparece en la salida tantas veces como bloques con ese
   texto haya en el XML.
2. Las llaves del X++ generado quedan balanceadas.

Detectan lo que "la salida se ve bien" no detecta: un método perdido en
silencio. Se aplican a **todos** los fixtures automáticamente, así que sumar un
tipo de artefacto nuevo es dejar su XML en `test/fixtures/xml/` y nada más.

### Los fixtures están anonimizados

Salen de un repositorio real, con los nombres y la lógica de negocio
reemplazados por equivalentes neutros. Lo que se preserva —y es lo único que le
importa al transpilador— es la **estructura del XML**: dónde aparecen los
`<Method>`, qué tipos usan `<Declaration>` y cuáles un método
`classDeclaration`, y cómo se anidan los contenedores.

Si agregás un fixture, hacé lo mismo: nunca subas código de un cliente.

## Convenciones

- TypeScript en modo estricto. Sin `any` salvo en el límite con el DOM.
- Errores del dominio como clases propias (`NotMetadataError`), nunca cadenas
  sueltas.
- Los comentarios explican **por qué**, no qué hace la línea de abajo.
- Cada opción de configuración se lee en `src/config.ts`, no esparcida por los
  comandos.

### `@types/vscode` va fijado, sin caret

El manifiesto declara `engines.vscode: ^1.90.0` y la dependencia dice `1.90.0`
exacta. Es a propósito: con un rango, npm traería la última publicada y el
compilador aceptaría APIs que no existen en 1.90 —justo lo que el typecheck
tiene que atrapar—. Para subir el piso mínimo se cambian las dos cosas a la vez.

## Empaquetado

```bash
npm run package     # genera el .vsix
```

`.vscodeignore` deja afuera las fuentes, los tests y las carpetas ocultas de la
raíz. El paquete ronda los 100 KB: la extensión no lleva binarios.

## Antes de un cambio grande

Los documentos de `docs/` existen para que no se repita trabajo ya hecho:

- [`como-funciona.md`](docs/como-funciona.md) — la reconstrucción en detalle y
  cómo se verifica.
- [`metadata-api.md`](docs/metadata-api.md) — por qué el transpilador lee el XML
  en vez de usar la API oficial de Microsoft, con el experimento reproducible.
- [`language-server.md`](docs/language-server.md) — investigación sobre el
  Language Server de X++, que **no** está implementado. Queda como punto de
  partida si alguna vez se retoma.
