# Cómo trabajar en este repositorio

## Los commits y los PR los decide Jonatan, no el agente

**No hacer un commit ni abrir un PR por cada pedido.** El trabajo se acumula en
el working tree, se reporta qué cambió, y el corte lo decide él.

Lo que sí corresponde hacer: **recomendar** dónde cortar cuando aparece un
límite natural, explicando por qué, y esperar la decisión. Una recomendación es
una frase al final de la respuesta, no un `git commit`.

Tampoco se mergea un PR salvo que lo pida explícitamente.

### Cuándo recomendar un corte

El criterio no es el tamaño del diff sino **si se puede revisar como una sola
decisión**. Conviene proponer un corte cuando:

- **Cambia el motivo del cambio.** Un arreglo de bug, una funcionalidad nueva,
  un ajuste de CI y una traducción son cuatro razones distintas. Mezclarlas
  vuelve el diff imposible de revisar y obliga a revertir cosas sanas para sacar
  la que falló.
- **Cambia el perfil de riesgo.** Algo que publica al mergearse no va junto con
  algo que no. Si un PR toca `package.json` en este proyecto, publica: eso nunca
  viaja con otra cosa.
- **Una parte está lista y la otra no.** Si algo ya se puede revisar y lo demás
  necesita más vueltas, frenar lo terminado atrasa sin ganar nada.
- **Una parte necesita probarse a mano y la otra no.** Lo que requiere F5 y ojo
  humano conviene separado de lo que CI valida solo.

Y cuándo **no** cortar:

- Un cambio no se separa de sus tests ni de su documentación. Van juntos: un PR
  que agrega comportamiento sin cubrirlo ni explicarlo está incompleto, no es
  "más chico".
- Un refactor que existe solo para habilitar el cambio que viene al lado va con
  ese cambio. Solo separado se ve como movimiento gratuito.

### Qué hacer mientras tanto

Trabajar, verificar que compile y que los tests pasen, y reportar en prosa qué
se tocó. Si se acumularon varios cambios de razones distintas, decirlo y
proponer el agrupamiento —"esto da para dos PR: el arreglo del foco por un lado
y la feature de exportación por otro"— pero sin ejecutarlo.

## No volcar la salida por consola

No interesan los diffs, los `cat` de archivos enteros ni los logs completos.
Cortar con `tail`/`head`/`grep`, usar flags silenciosos, y **reportar el
resultado en el texto de la respuesta** en vez de dejar que se lea del output de
las herramientas. Verificar sigue siendo obligatorio; lo que sobra es imprimirlo.

**Los archivos se editan por Bash, no con las herramientas de escritura.** La
interfaz renderiza el diff completo de cada llamada a Write o Edit, y eso es lo
que llena la consola. Un heredoc, un script corto o `sed` hacen el mismo cambio
sin mostrar nada. Las herramientas de escritura quedan para cuando Bash
realmente no alcanza.

**No invocar `claude` desde Bash.** Abre una sesión anidada que responde como si
fuera un prompt, en vez de ejecutar lo que se le pidió.

## Contexto del proyecto

Extensión de VS Code que reconstruye X++ legible desde los XML de metadatos de
D365FO. El código X++ ya está adentro del XML en bloques `CDATA`: la extensión
**extrae y rearma**, no transpila ni compila, y no necesita ningún binario de
Microsoft.

Convenciones que ya están establecidas y conviene no romper:

- **Los comentarios, los mensajes de commit y `docs/` van en español.** Todo lo
  que ve el usuario de la extensión va en inglés: README, CHANGELOG, títulos de
  comandos, descripciones de settings, notificaciones y los diagnósticos del
  transpilador —que no son internos, se escriben en el canal de salida y dentro
  del X++ generado.
- **Lo que se puede testear sin VS Code, va fuera de la capa de VS Code.** Es
  por qué `src/transpiler/`, `src/exportLayout.ts` y `src/pathPicker.ts` no
  importan `vscode`: se prueban con `node --test` sin levantar el editor.
- **`node --test` no expande globs hasta Node 22 y CI corre Node 20.** Un
  archivo de tests nuevo hay que nombrarlo en el script `test` de
  `package.json`, o no se ejecuta y nadie se entera.
- **Los paquetes `@types/*` siguen el piso de compatibilidad, no la última
  versión.** `@types/vscode` tiene que coincidir con `engines.vscode`: subirlo
  deja compilar contra APIs que no existen en la versión mínima soportada, y eso
  no lo detecta ninguna prueba local.
- **Un solo comando por intención.** Ya está documentado en el código por qué
  hay un único comando de vista: dos comandos parecidos generan la duda de cuál
  usar. Antes de agregar uno, evaluar si es una opción del que ya existe.
