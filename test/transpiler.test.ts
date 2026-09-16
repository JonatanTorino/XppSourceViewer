/**
 * Tests del transpilador.
 *
 * La prueba que realmente discrimina no es "la salida se ve bien", porque eso no
 * detecta un método perdido: el archivo generado sigue pareciendo correcto. Las
 * dos invariantes que sí lo detectan son:
 *
 *   1. Cada bloque `<Source>` del XML aparece exactamente una vez en la salida.
 *   2. Las llaves del X++ generado quedan balanceadas.
 *
 * Se aplican sobre todos los fixtures a la vez, así que cualquier tipo nuevo
 * queda cubierto con solo agregar su XML.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { looksLikeMetadata, NotMetadataError, transpile } from '../src/transpiler';
import { normalizeSource } from '../src/transpiler/walker';

const FIXTURE_DIR = join(__dirname, '..', '..', 'test', 'fixtures', 'xml');

function fixture(name: string): string {
    return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

function allFixtures(): string[] {
    return readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.xml'));
}

/**
 * Recorta el `<SourceCode>` de la raíz.
 *
 * Los tipos de vista traen un segundo `<SourceCode>` bajo `<ViewMetadata>` con la
 * consulta embebida, que es otra unidad de compilación. Estas comprobaciones son
 * sobre el código del artefacto, así que miran el mismo bloque que mira el
 * transpilador. Que el otro quede afuera se verifica por separado, en el test de
 * AxDataEntityView.
 */
function rootSourceCode(xml: string): string {
    const start = xml.indexOf('<SourceCode>');
    if (start === -1) {
        return '';
    }
    const end = xml.indexOf('</SourceCode>', start);
    return end === -1 ? '' : xml.slice(start, end);
}

/**
 * Extrae el contenido de cada `<Source>` del XML, sin depender del transpilador.
 *
 * Se omite `classDeclaration`, que es el único bloque que la emisión transforma a
 * propósito: se le quita la llave de cierre para poder insertar el cuerpo de la
 * clase, así que no puede aparecer verbatim. Su supervivencia se verifica aparte,
 * por la primera línea.
 */
function cdataSources(xml: string): string[] {
    const out: string[] = [];
    const re = /<Method>([\s\S]*?)<\/Method>/g;
    xml = rootSourceCode(xml);
    let match: RegExpExecArray | null;

    while ((match = re.exec(xml)) !== null) {
        const block = match[1];
        const name = /<Name>([\s\S]*?)<\/Name>/.exec(block)?.[1]?.trim();
        if (name === 'classDeclaration') {
            continue;
        }
        const source = /<Source>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/Source>/.exec(block);
        if (source) {
            out.push(normalizeSource(source[1]));
        }
    }
    return out;
}

/** Primera línea con contenido del `classDeclaration`, si el artefacto lo usa. */
function classDeclarationHead(xml: string): string | undefined {
    const re = /<Method>([\s\S]*?)<\/Method>/g;
    xml = rootSourceCode(xml);
    let match: RegExpExecArray | null;

    while ((match = re.exec(xml)) !== null) {
        const block = match[1];
        if (/<Name>\s*classDeclaration\s*<\/Name>/.test(block)) {
            const source = /<Source>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/Source>/.exec(block);
            return source ? normalizeSource(source[1]).split('\n')[0] : undefined;
        }
    }
    return undefined;
}

/** Cuenta llaves ignorando las que aparecen en cadenas y comentarios. */
function braceBalance(code: string): number {
    let depth = 0;
    let inLineComment = false;
    let inBlockComment = false;
    let inString: string | null = null;

    for (let i = 0; i < code.length; i++) {
        const c = code[i];
        const next = code[i + 1];

        if (inLineComment) {
            if (c === '\n') {
                inLineComment = false;
            }
            continue;
        }
        if (inBlockComment) {
            if (c === '*' && next === '/') {
                inBlockComment = false;
                i++;
            }
            continue;
        }
        if (inString) {
            if (c === '\\') {
                i++;
            } else if (c === inString) {
                inString = null;
            }
            continue;
        }
        if (c === '/' && next === '/') {
            inLineComment = true;
            i++;
            continue;
        }
        if (c === '/' && next === '*') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (c === '"' || c === "'") {
            inString = c;
            continue;
        }
        if (c === '{') {
            depth++;
        } else if (c === '}') {
            depth--;
        }
    }
    return depth;
}

describe('invariantes sobre todos los fixtures', () => {
    for (const name of allFixtures()) {
        const xml = fixture(name);

        it(`${name}: cada <Source> aparece exactamente una vez`, () => {
            const result = transpile(xml, { eol: 'lf' });

            // El código no parseable se emite verbatim y no pasa por el emisor.
            if (result.unparsable) {
                return;
            }

            // Se cuenta por texto distinto, no por bloque: dos métodos de
            // contenedores distintos pueden tener un cuerpo idéntico —un
            // `modified()` que solo llama a `super()`, por ejemplo—, y entonces lo
            // correcto es que ese texto aparezca tantas veces como bloques haya.
            const expected = new Map<string, number>();
            for (const source of cdataSources(xml)) {
                expected.set(source, (expected.get(source) ?? 0) + 1);
            }

            for (const [source, times] of expected) {
                const occurrences = result.xpp.split(source).length - 1;
                assert.equal(
                    occurrences,
                    times,
                    `el bloque que empieza con ${JSON.stringify(
                        source.trim().split('\n')[0]
                    )} aparece ${occurrences} veces, se esperaban ${times}`
                );
            }
        });

        it(`${name}: la declaración de clase encabeza la salida`, () => {
            const result = transpile(xml, { eol: 'lf' });
            const head = classDeclarationHead(xml);

            if (result.unparsable || result.empty || !head) {
                return;
            }
            assert.ok(
                result.xpp.startsWith(head),
                `se esperaba que la salida empezara con ${JSON.stringify(head)}`
            );
        });

        it(`${name}: las llaves quedan balanceadas`, () => {
            const result = transpile(xml, { eol: 'lf' });
            if (result.unparsable || result.empty) {
                return;
            }
            assert.equal(braceBalance(result.xpp), 0, 'las llaves no cierran');
        });
    }
});

describe('AxClass', () => {
    it('reconstruye la declaración con sus miembros y ambos métodos', () => {
        const result = transpile(fixture('AxClass.Demo.xml'), { eol: 'lf' });

        assert.equal(result.kind, 'AxClass');
        assert.equal(result.name, 'DemoEventSubscriber');
        assert.equal(result.methodCount, 2);
        assert.equal(result.empty, false);

        assert.match(result.xpp, /^internal final class DemoEventSubscriber\n\{\n/);
        assert.match(result.xpp, /private int counter;/);
        assert.match(result.xpp, /public static void registerKeys\(Set _keys\)/);
        assert.match(result.xpp, /public void increment\(\)/);
        assert.match(result.xpp, /\n\}$/);
    });
});

describe('AxForm', () => {
    it('conserva los métodos anidados de origen de datos, campo y control', () => {
        const result = transpile(fixture('AxForm.Demo.xml'), { eol: 'lf' });

        // init + active + modified + pageActivated. classDeclaration no cuenta:
        // se consume como cabecera de la clase.
        assert.equal(result.methodCount, 4);

        // Estos tres viven en niveles anidados. Un lector que solo mire el nivel
        // raíz los descarta sin avisar, y el .xpp resultante parece correcto.
        assert.match(result.xpp, /public int active\(\)/);
        assert.match(result.xpp, /public void modified\(\)/);
        assert.match(result.xpp, /public void pageActivated\(\)/);
    });

    it('envuelve cada contenedor en su clase anidada con el atributo correcto', () => {
        const result = transpile(fixture('AxForm.Demo.xml'), { eol: 'lf' });

        assert.match(result.xpp, /^\[Form\]\npublic class DemoCatalogForm extends FormRun\n\{/);
        assert.match(result.xpp, /\n {4}\[DataSource\]\n {4}class DemoTable\n {4}\{/);
        assert.match(result.xpp, /\n {8}\[DataField\]\n {8}class SourceLocation\n {8}\{/);
        assert.match(result.xpp, /\n {4}\[Control\('TabPage'\)\]\n {4}class OverviewTabPage\n {4}\{/);
    });

    it('alinea el cuerpo de cada método con la sangría que ya trae el CDATA', () => {
        const result = transpile(fixture('AxForm.Demo.xml'), { eol: 'lf' });
        const lines = result.xpp.split('\n');

        const indentOf = (needle: string): number => {
            const line = lines.find((l) => l.includes(needle));
            assert.ok(line, `no se encontró ${needle}`);
            return line.length - line.trimStart().length;
        };

        assert.equal(indentOf('public void init()'), 4);
        assert.equal(indentOf('public int active()'), 8);
        assert.equal(indentOf('public void pageActivated()'), 8);
        assert.equal(indentOf('public void modified()'), 12);
    });
});

describe('AxQuery', () => {
    it('usa el método classDeclaration como cabecera cuando no hay <Declaration>', () => {
        const result = transpile(fixture('AxQuery.Demo.xml'), { eol: 'lf' });

        assert.equal(result.name, 'DemoFormatMappingQuery');
        assert.match(result.xpp, /^\[Query\]\npublic class DemoFormatMappingQuery extends QueryRun/);
        assert.match(result.xpp, /\}$/);
    });
});

describe('AxDataEntityView', () => {
    it('excluye el ViewMetadata, que es otra unidad de compilación', () => {
        const result = transpile(fixture('AxDataEntityView.Demo.xml'), { eol: 'lf' });

        assert.equal(result.methodCount, 1);
        assert.match(result.xpp, /public void postLoad\(\)/);

        // `ViewMetadata/SourceCode` contiene `[Query] class Metadata extends
        // QueryRun`, la consulta embebida de la entidad. Mezclarla en la clase de
        // la entidad produciría X++ que no compila.
        assert.doesNotMatch(result.xpp, /class Metadata extends QueryRun/);
        assert.doesNotMatch(result.xpp, /\[Query\]/);
    });
});

describe('artefactos sin código', () => {
    it('una tabla de staging da resultado vacío, no un error', () => {
        const result = transpile(fixture('AxTable.StagingNoSource.xml'), { eol: 'lf' });

        assert.equal(result.empty, true);
        assert.equal(result.xpp, '');
        assert.equal(result.methodCount, 0);
        assert.equal(result.diagnostics.some((d) => d.severity === 'error'), false);
    });

    it('una extensión de tabla no lleva SourceCode y se reporta como vacía', () => {
        const result = transpile(fixture('AxTableExtension.NoSource.xml'), { eol: 'lf' });

        assert.equal(result.kind, 'AxTableExtension');
        assert.equal(result.empty, true);
        assert.ok(result.diagnostics.some((d) => d.message.includes('AxTableExtension')));
    });
});

describe('UnparsableSource', () => {
    it('se emite verbatim y se marca con una advertencia', () => {
        const result = transpile(fixture('AxClass.Unparsable.xml'), { eol: 'lf' });

        assert.equal(result.unparsable, true);
        assert.match(result.xpp, /public void oops\(/);
        assert.ok(result.diagnostics.some((d) => d.severity === 'warning'));
    });
});

describe('entradas inválidas', () => {
    it('rechaza un XML que no es de metadatos', () => {
        assert.throws(
            () => transpile('<?xml version="1.0"?><project><item /></project>'),
            NotMetadataError
        );
    });

    it('rechaza texto que no es XML', () => {
        assert.throws(() => transpile('esto no es xml'), NotMetadataError);
    });

    it('looksLikeMetadata filtra sin parsear', () => {
        assert.equal(looksLikeMetadata(fixture('AxClass.Demo.xml')), true);
        assert.equal(looksLikeMetadata(fixture('AxTableExtension.NoSource.xml')), false);
        assert.equal(looksLikeMetadata('<project><item /></project>'), false);
    });
});

describe('fin de línea', () => {
    it('emite CRLF por defecto, que es lo que usa D365FO', () => {
        const result = transpile(fixture('AxClass.Demo.xml'));
        assert.ok(result.xpp.includes('\r\n'));
        assert.equal(/[^\r]\n/.test(result.xpp), false);
    });

    it('emite LF cuando se pide', () => {
        const result = transpile(fixture('AxClass.Demo.xml'), { eol: 'lf' });
        assert.equal(result.xpp.includes('\r'), false);
    });
});

describe('stripDocComments', () => {
    it('quita los bloques /// y conserva el código', () => {
        const result = transpile(fixture('AxClass.Demo.xml'), {
            eol: 'lf',
            stripDocComments: true
        });

        assert.doesNotMatch(result.xpp, /\/\/\//);
        assert.doesNotMatch(result.xpp, /<summary>/);

        // El código tiene que sobrevivir intacto.
        assert.match(result.xpp, /public static void registerKeys\(Set _keys\)/);
        assert.match(result.xpp, /_keys\.add\(configurationKeyNum\(DemoExtension\)\);/);
        assert.match(result.xpp, /public void increment\(\)/);
    });

    it('no deja huecos de más de una línea en blanco', () => {
        const result = transpile(fixture('AxForm.Demo.xml'), {
            eol: 'lf',
            stripDocComments: true
        });
        assert.doesNotMatch(result.xpp, /\n{3,}/);
    });

    it('respeta la sangría de lo que queda', () => {
        const result = transpile(fixture('AxForm.Demo.xml'), {
            eol: 'lf',
            stripDocComments: true
        });
        const line = result.xpp.split('\n').find((l) => l.includes('public void modified()'));
        assert.ok(line);
        assert.equal(line.length - line.trimStart().length, 12);
    });

    it('está desactivado por defecto', () => {
        const result = transpile(fixture('AxClass.Demo.xml'), { eol: 'lf' });
        assert.match(result.xpp, /\/\/\/ <summary>/);
    });
});

describe('headerComment', () => {
    it('antepone tipo, nombre y cantidad de métodos', () => {
        const result = transpile(fixture('AxClass.Demo.xml'), {
            eol: 'lf',
            headerComment: true
        });
        assert.match(result.xpp, /^\/\/ AxClass DemoEventSubscriber — 2 métodos\n/);
    });

    it('usa el singular cuando hay un solo método', () => {
        const result = transpile(fixture('AxDataEntityView.Demo.xml'), {
            eol: 'lf',
            headerComment: true
        });
        assert.match(result.xpp, /— 1 método\n/);
    });

    it('incluye la procedencia cuando se la pasan', () => {
        const result = transpile(fixture('AxClass.Demo.xml'), {
            eol: 'lf',
            headerComment: true,
            sourceLabel: 'Modulo/Modelo/AxClass/DemoEventSubscriber.xml'
        });
        assert.match(result.xpp, /^\/\/ Origen: Modulo\/Modelo\/AxClass\/DemoEventSubscriber\.xml$/m);
    });

    it('no se agrega a un artefacto vacío', () => {
        const result = transpile(fixture('AxTable.StagingNoSource.xml'), {
            eol: 'lf',
            headerComment: true
        });
        assert.equal(result.xpp, '');
    });

    it('no rompe el balance de llaves', () => {
        const result = transpile(fixture('AxForm.Demo.xml'), {
            eol: 'lf',
            headerComment: true,
            stripDocComments: true
        });
        assert.equal(braceBalance(result.xpp), 0);
    });
});
