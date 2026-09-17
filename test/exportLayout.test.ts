/**
 * Tests de la disposición de salida al exportar una carpeta.
 *
 * Las expectativas se arman con `join` y no con literales: el separador cambia
 * entre Windows y el Linux de CI, y un test escrito con barras fijas pasaría en
 * una plataforma y fallaría en la otra por una razón que no tiene nada que ver
 * con lo que se quiere probar.
 */

import assert from 'node:assert/strict';
import { join, sep } from 'node:path';
import { describe, it } from 'node:test';

import { targetDirFor } from '../src/exportLayout';

const SOURCE = join('C:', 'Metadata');
const OUT = join('C:', 'export');

describe('byType', () => {
    it('agrupa por tipo sin mirar de dónde salió el archivo', () => {
        const a = targetDirFor(
            'byType',
            OUT,
            SOURCE,
            join(SOURCE, 'MyModule', 'AxClass', 'Foo.xml'),
            'AxClass'
        );
        const b = targetDirFor('byType', OUT, SOURCE, join(SOURCE, 'Otro', 'Bar.xml'), 'AxClass');

        assert.equal(a, join(OUT, 'AxClass'));
        assert.equal(a, b);
    });
});

describe('mirror', () => {
    it('reproduce la estructura de origen', () => {
        const target = targetDirFor(
            'mirror',
            OUT,
            SOURCE,
            join(SOURCE, 'MyModule', 'AxClass', 'Foo.xml'),
            'AxClass'
        );

        assert.equal(target, join(OUT, 'MyModule', 'AxClass'));
    });

    it('un archivo en la raíz del origen va a la raíz de la salida', () => {
        const target = targetDirFor('mirror', OUT, SOURCE, join(SOURCE, 'Foo.xml'), 'AxClass');

        assert.equal(target, OUT);
    });

    it('no deja un separador colgando', () => {
        const target = targetDirFor('mirror', OUT, SOURCE, join(SOURCE, 'Foo.xml'), 'AxClass');

        assert.ok(!target.endsWith(sep), `la ruta termina en separador: ${target}`);
    });

    it('conserva la profundidad, por honda que sea', () => {
        const deep = join(SOURCE, 'a', 'b', 'c', 'd', 'AxForm', 'Bar.xml');
        const target = targetDirFor('mirror', OUT, SOURCE, deep, 'AxForm');

        assert.equal(target, join(OUT, 'a', 'b', 'c', 'd', 'AxForm'));
    });

    it('la salida nunca se escapa de la carpeta destino', () => {
        // La invariante que importa: mientras el archivo esté debajo del origen,
        // el resultado cae adentro de la salida. Es lo que impide que una
        // exportacion escriba fuera de donde se le dijo.
        const files = [
            join(SOURCE, 'Foo.xml'),
            join(SOURCE, 'MyModule', 'Foo.xml'),
            join(SOURCE, 'MyModule', 'AxClass', 'Foo.xml'),
            join(SOURCE, 'a', 'b', 'c', 'Foo.xml')
        ];

        for (const file of files) {
            const target = targetDirFor('mirror', OUT, SOURCE, file, 'AxClass');
            assert.ok(
                target === OUT || target.startsWith(OUT + sep),
                `${file} se escapo a ${target}`
            );
            assert.ok(!target.includes('..'), `${file} trepo con .. hasta ${target}`);
        }
    });
});

describe('los dos modos', () => {
    it('difieren cuando el artefacto está anidado', () => {
        const file = join(SOURCE, 'MyModule', 'AxClass', 'Foo.xml');

        assert.notEqual(
            targetDirFor('mirror', OUT, SOURCE, file, 'AxClass'),
            targetDirFor('byType', OUT, SOURCE, file, 'AxClass')
        );
    });
});
