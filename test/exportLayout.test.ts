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

import { targetPathFor } from '../src/exportLayout';

const SOURCE = join('C:', 'Metadata');
const OUT = join('C:', 'export');

/** La ruta tipica de un repositorio de metadatos: paquete, modelo, tipo. */
const NESTED = join(SOURCE, 'MiPaquete', 'MiModelo', 'AxClass', 'Foo.xml');

describe('byType', () => {
    it('agrupa por tipo sin mirar de dónde salió el archivo', () => {
        const a = targetPathFor('byType', OUT, SOURCE, NESTED, 'AxClass', 'Foo');
        const b = targetPathFor(
            'byType',
            OUT,
            SOURCE,
            join(SOURCE, 'Otro', 'AxClass', 'Foo.xml'),
            'AxClass',
            'Foo'
        );

        assert.equal(a, join(OUT, 'AxClass', 'Foo.xpp'));
        assert.equal(a, b);
    });
});

describe('mirror', () => {
    it('reproduce la estructura de origen', () => {
        assert.equal(
            targetPathFor('mirror', OUT, SOURCE, NESTED, 'AxClass', 'Foo'),
            join(OUT, 'MiPaquete', 'MiModelo', 'AxClass', 'Foo.xpp')
        );
    });

    it('un archivo en la raíz del origen va a la raíz de la salida', () => {
        assert.equal(
            targetPathFor('mirror', OUT, SOURCE, join(SOURCE, 'Foo.xml'), 'AxClass', 'Foo'),
            join(OUT, 'Foo.xpp')
        );
    });

    it('la salida nunca se escapa de la carpeta destino', () => {
        // La invariante que importa: mientras el archivo este debajo del
        // origen, el resultado cae adentro de la salida. Es lo que impide que
        // una exportacion escriba fuera de donde se le dijo.
        const files = [
            join(SOURCE, 'Foo.xml'),
            join(SOURCE, 'MiModelo', 'Foo.xml'),
            NESTED,
            join(SOURCE, 'a', 'b', 'c', 'AxClass', 'Foo.xml')
        ];

        for (const file of files) {
            const target = targetPathFor('mirror', OUT, SOURCE, file, 'AxClass', 'Foo');
            assert.ok(target.startsWith(OUT + sep), `${file} se escapo a ${target}`);
            assert.ok(!target.includes('..'), `${file} trepo con .. hasta ${target}`);
        }
    });
});

describe('xppSource', () => {
    it('una carpeta por modelo, con el tipo como prefijo del archivo', () => {
        assert.equal(
            targetPathFor('xppSource', OUT, SOURCE, NESTED, 'AxClass', 'Foo'),
            join(OUT, 'MiModelo', 'AxClass_Foo.xpp')
        );
    });

    it('el paquete no aparece: la carpeta es la del modelo', () => {
        const target = targetPathFor('xppSource', OUT, SOURCE, NESTED, 'AxClass', 'Foo');

        assert.ok(!target.includes('MiPaquete'), `el paquete se colo en ${target}`);
    });

    it('artefactos de distinto tipo y mismo nombre no se pisan', () => {
        // Sin el prefijo del tipo, una clase y un formulario con el mismo
        // nombre escribirian sobre el mismo archivo. Es justamente lo que la
        // convencion evita.
        const clase = targetPathFor('xppSource', OUT, SOURCE, NESTED, 'AxClass', 'Foo');
        const form = targetPathFor(
            'xppSource',
            OUT,
            SOURCE,
            join(SOURCE, 'MiPaquete', 'MiModelo', 'AxForm', 'Foo.xml'),
            'AxForm',
            'Foo'
        );

        assert.notEqual(clase, form);
        assert.equal(form, join(OUT, 'MiModelo', 'AxForm_Foo.xpp'));
    });

    it('agrupa en el mismo modelo lo que viene de tipos distintos', () => {
        const clase = targetPathFor('xppSource', OUT, SOURCE, NESTED, 'AxClass', 'Foo');
        const tabla = targetPathFor(
            'xppSource',
            OUT,
            SOURCE,
            join(SOURCE, 'MiPaquete', 'MiModelo', 'AxTable', 'Bar.xml'),
            'AxTable',
            'Bar'
        );

        assert.equal(join(clase, '..'), join(tabla, '..'));
    });

    it('no sube un nivel cuando la carpeta no es la del tipo', () => {
        // Un arbol que no sigue la convencion: subir a ciegas tomaria como
        // modelo una carpeta que no lo es.
        const suelto = join(SOURCE, 'MiModelo', 'Foo.xml');

        assert.equal(
            targetPathFor('xppSource', OUT, SOURCE, suelto, 'AxClass', 'Foo'),
            join(OUT, 'MiModelo', 'AxClass_Foo.xpp')
        );
    });

    it('la carpeta del tipo se reconoce sin importar mayúsculas', () => {
        const raro = join(SOURCE, 'MiPaquete', 'MiModelo', 'axclass', 'Foo.xml');

        assert.equal(
            targetPathFor('xppSource', OUT, SOURCE, raro, 'AxClass', 'Foo'),
            join(OUT, 'MiModelo', 'AxClass_Foo.xpp')
        );
    });
});

describe('los tres modos', () => {
    it('dan rutas distintas para el mismo artefacto', () => {
        const rutas = new Set(
            (['mirror', 'byType', 'xppSource'] as const).map((layout) =>
                targetPathFor(layout, OUT, SOURCE, NESTED, 'AxClass', 'Foo')
            )
        );

        assert.equal(rutas.size, 3);
    });
});
