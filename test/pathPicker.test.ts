/**
 * Tests del autocompletado de rutas.
 *
 * Son a propósito independientes de la plataforma: se pasan rutas con `\` y con
 * `/` como strings literales, porque lo que se prueba es cómo se descompone lo
 * que alguien escribe, no cómo las arma el sistema operativo.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { filterDirs, splitTypedPath } from '../src/pathPicker';

describe('splitTypedPath', () => {
    it('separa la carpeta del segmento a medio escribir', () => {
        assert.deepEqual(splitTypedPath('C:\\Repos\\Jo'), { dir: 'C:\\Repos', prefix: 'Jo' });
    });

    it('sin segmento pendiente, lista la carpeta entera', () => {
        assert.deepEqual(splitTypedPath('C:\\Repos\\'), { dir: 'C:\\Repos', prefix: '' });
    });

    it('la raíz de un disco es una carpeta, no un prefijo', () => {
        assert.deepEqual(splitTypedPath('C:\\'), { dir: 'C:\\', prefix: '' });
    });

    it('un disco sin barra ya identifica una carpeta', () => {
        assert.deepEqual(splitTypedPath('C:'), { dir: 'C:\\', prefix: '' });
    });

    it('acepta barras normales, que es como mucha gente escribe en Windows', () => {
        assert.deepEqual(splitTypedPath('C:/Repos/Jo'), { dir: 'C:/Repos', prefix: 'Jo' });
    });

    it('sin separador no hay nada que listar', () => {
        // `Repos` a secas no dice respecto de que, y adivinar una base llevaria
        // a ofrecer carpetas de otro lado.
        assert.deepEqual(splitTypedPath('Repos'), { dir: '', prefix: 'Repos' });
    });

    it('vacío no propone nada', () => {
        assert.deepEqual(splitTypedPath(''), { dir: '', prefix: '' });
        assert.deepEqual(splitTypedPath('   '), { dir: '', prefix: '' });
    });

    it('rutas POSIX', () => {
        assert.deepEqual(splitTypedPath('/home/jt/pro'), { dir: '/home/jt', prefix: 'pro' });
        assert.deepEqual(splitTypedPath('/'), { dir: '/', prefix: '' });
    });

    it('anidamiento profundo: solo importa el último tramo', () => {
        assert.deepEqual(splitTypedPath('C:\\a\\b\\c\\d\\Ax'), {
            dir: 'C:\\a\\b\\c\\d',
            prefix: 'Ax'
        });
    });
});

describe('filterDirs', () => {
    const NAMES = ['AxClass', 'AxForm', 'AxTable', 'Descriptor', 'bin'];

    it('filtra por prefijo', () => {
        assert.deepEqual(filterDirs(NAMES, 'Ax'), ['AxClass', 'AxForm', 'AxTable']);
    });

    it('sin prefijo devuelve todo, ordenado', () => {
        assert.deepEqual(filterDirs(['zeta', 'alfa', 'beta'], ''), ['alfa', 'beta', 'zeta']);
    });

    it('no distingue mayúsculas', () => {
        // En Windows las rutas tampoco distinguen, y obligar a acertarlas seria
        // justo la molestia que esto viene a evitar.
        assert.deepEqual(filterDirs(NAMES, 'axc'), ['AxClass']);
        assert.deepEqual(filterDirs(NAMES, 'BIN'), ['bin']);
    });

    it('sin coincidencias devuelve vacío, no todo', () => {
        assert.deepEqual(filterDirs(NAMES, 'zzz'), []);
    });
});
