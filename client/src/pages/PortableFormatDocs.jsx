import React from 'react';
import { Link } from 'react-router-dom';

const example = `{
  "format": "smxform.quiz",
  "version": 1,
  "title": "La cèl·lula",
  "description": "Qüestionari de biologia",
  "settings": {
    "maxScore": 10,
    "shuffleQuestions": false,
    "allowRetry": false,
    "maxAttempts": 1,
    "negativePenalty": 0,
    "gradeToExport": "BEST",
    "showResults": "SCORE",
    "showResultsFrom": null
  },
  "questions": [
    {
      "type": "MCQ",
      "text": "Quin orgànul produeix energia?",
      "points": 1,
      "required": true,
      "shuffleOptions": true,
      "multiple": false,
      "options": [
        { "text": "Mitocondri", "correct": true },
        { "text": "Ribosoma", "correct": false },
        { "text": "Nucli", "correct": false }
      ]
    },
    {
      "type": "SHORT_TEXT",
      "text": "Quin gas absorbeix la planta?",
      "points": 1,
      "required": true,
      "shuffleOptions": false,
      "accepted": ["diòxid de carboni", "CO2"]
    }
  ]
}`;

function Field({ name, children }) {
  return <tr><th scope="row"><code>{name}</code></th><td>{children}</td></tr>;
}

export default function PortableFormatDocs() {
  return (
    <main className="format-docs">
      <header className="format-header">
        <Link to="/" className="format-brand">smxForm <span>/ Format obert</span></Link>
        <Link to="/t">Espai del professorat ↗</Link>
      </header>
      <article className="format-content">
        <span className="eyebrow">ESPECIFICACIÓ PÚBLICA · VERSIÓ 1</span>
        <h1>Format d’entregues smxForm</h1>
        <p className="format-intro">Un fitxer JSON de text pla amb preguntes, respostes correctes i configuració. Els noms de camps i les respostes són semàntics: es pot redactar a mà o generar amb una LLM sense conèixer cap identificador intern.</p>

        <h2>Envolupant del document</h2>
        <p>El document és un objecte JSON UTF-8. Té exactament aquests camps principals necessaris (es poden afegir camps desconeguts, que la importació ignora):</p>
        <div className="format-table-wrap"><table><tbody>
          <Field name="format">Obligatori. Cadena literal <code>smxform.quiz</code>.</Field>
          <Field name="version">Obligatori. Enter <code>1</code>. Les altres versions es rebutgen.</Field>
          <Field name="title">Obligatori. Text d’1 a 200 caràcters.</Field>
          <Field name="description">Opcional. Cadena de fins a 5000 caràcters; per defecte, cadena buida.</Field>
          <Field name="settings">Opcional. Objecte de configuració global descrit a continuació.</Field>
          <Field name="questions">Obligatori. Llista d’1 a 200 preguntes, en l’ordre de presentació.</Field>
        </tbody></table></div>

        <h2>Configuració de l’entrega</h2>
        <p>Tots els camps de <code>settings</code> són opcionals; si s’ometen, s’aplica el valor indicat. Les notes sempre es calculen sobre la suma dels punts de les preguntes i després s’escaleen a <code>maxScore</code>.</p>
        <div className="format-table-wrap"><table><tbody>
          <Field name="maxScore">Nombre superior a 0 i fins a 1000. Nota màxima mostrada, per defecte <code>10</code>.</Field>
          <Field name="shuffleQuestions">Booleà. Barreja les preguntes per alumne; per defecte <code>false</code>.</Field>
          <Field name="allowRetry">Booleà. Permet més d’un intent; per defecte <code>false</code>.</Field>
          <Field name="maxAttempts">Enter d’1 a 100; per defecte <code>1</code>. Només s’aplica quan <code>allowRetry</code> és true.</Field>
          <Field name="negativePenalty">Nombre entre 0 i 1: fracció dels punts de la pregunta que es resten per una resposta incorrecta. <code>0</code> no resta; per defecte <code>0</code>.</Field>
          <Field name="gradeToExport"><code>BEST</code> (millor intent) o <code>LAST</code> (últim intent); per defecte <code>BEST</code>. Regula l’exportació de notes a Classroom.</Field>
          <Field name="showResults"><code>NONE</code> (no mostra resultats), <code>SCORE</code> (només nota) o <code>FULL</code> (nota, respostes i clau); per defecte <code>SCORE</code>.</Field>
          <Field name="showResultsFrom">Data/hora ISO 8601 amb zona horària, per exemple <code>2026-10-14T08:00:00.000Z</code>; amaga els resultats fins aquell moment. <code>null</code> o absència: sense retard.</Field>
        </tbody></table></div>
        <p>La importació sempre crea l’entrega com a esborrany no publicat. L’estat de publicació, l’enllaç públic, l’enllaç de Classroom i els intents no formen part del fitxer.</p>

        <h2>Camps comuns de cada pregunta</h2>
        <div className="format-table-wrap"><table><tbody>
          <Field name="type">Obligatori. Un dels tipus exactes que es detallen més avall.</Field>
          <Field name="text">Obligatori. Enunciat de text no buit, fins a 5000 caràcters.</Field>
          <Field name="points">Nombre entre 0 i 1000; per defecte <code>1</code>.</Field>
          <Field name="required">Booleà. Si és true, l’alumne l’ha de respondre per enviar; per defecte <code>true</code>.</Field>
          <Field name="shuffleOptions">Booleà. Barreja les opcions que admeten ordre aleatori; per defecte <code>true</code> als tipus compatibles, <code>false</code> a la resta.</Field>
          <Field name="image">Opcional per als tipus excepte <code>IMAGE_LABEL</code>, on és obligatori. Data URI base64 d’una imatge PNG, JPEG, WebP o GIF: <code>data:image/png;base64,...</code>. Màxim 5 MiB descodificats. L’importador comprova el tipus real del fitxer. Per a preguntes amb imatge d’etiquetatge, els punts són coordenades percentuals respecte a la imatge.</Field>
        </tbody></table></div>

        <h2>Tipus de pregunta</h2>
        <h3><code>MCQ</code> · Opció múltiple</h3>
        <p>Afegiu <code>multiple</code> (booleà, per defecte false) i <code>options</code>, una llista de 2 a 12 objectes. Cada opció té <code>text</code> (cadena no buida) i <code>correct</code> (booleà). Marqueu com a correctes una o més opcions; amb <code>multiple: false</code> s’ha de marcar exactament una. El corrector dona puntuació parcial proporcional quan s’activa l’elecció múltiple.</p>
        <pre><code>{`"type": "MCQ", "multiple": true, "options": [{"text":"A", "correct":true}, {"text":"B", "correct":true}, {"text":"C", "correct":false}]`}</code></pre>

        <h3><code>TRUE_FALSE</code> · Cert o fals</h3>
        <p>Afegiu <code>correct</code> amb el valor JSON <code>true</code> o <code>false</code>, no una cadena.</p>
        <pre><code>{`"type": "TRUE_FALSE", "correct": false`}</code></pre>

        <h3><code>MATCHING</code> · Relacionar</h3>
        <p><code>pairs</code> és una llista de 2 a 12 objectes <code>{'{ "left": "...", "right": "..." }'}</code>. El valor de <code>right</code> en cada parella és la resposta correcta per a aquell <code>left</code>. <code>distractors</code> és una llista opcional de cadenes que s’afegeixen a la columna dreta sense parella correcta; el total de respostes de la dreta no pot superar 15. Tots els textos de parella han de ser no buits.</p>
        <pre><code>{`"type": "MATCHING",
"pairs": [{"left":"HTTP", "right":"80"}, {"left":"HTTPS", "right":"443"}],
"distractors": ["21"]`}</code></pre>

        <h3><code>IMAGE_LABEL</code> · Etiquetar una imatge</h3>
        <p><code>image</code> és obligatori. <code>markers</code> és una llista d’1 a 30 punts. Cada punt conté <code>x</code> i <code>y</code> (nombres de 0 a 100, percentatge des de l’angle superior esquerre) i <code>label</code> (la resposta correcta). <code>predefined</code> és booleà: true fa que l’alumne triï d’una llista. <code>extraLabels</code> és una llista opcional de distractors de text, només utilitzada quan <code>predefined</code> és true.</p>
        <pre><code>{`"type": "IMAGE_LABEL", "image": "data:image/png;base64,...",
"markers": [{"x": 42.5, "y": 31, "label": "Nucli"}],
"predefined": true, "extraLabels": ["Membrana"]`}</code></pre>

        <h3><code>SHORT_TEXT</code> · Resposta breu autocorregida</h3>
        <p><code>accepted</code> és una llista de respostes acceptades; la comparació ignora majúscules, accents i espais exteriors. Indiqueu almenys una resposta o bé una <code>regex</code> opcional (expressió regular JavaScript, fins a 200 caràcters). Es poden combinar. Si s’especifica una expressió regular, aquesta també compta com a resposta correcta.</p>
        <pre><code>{`"type": "SHORT_TEXT", "accepted": ["diòxid de carboni", "CO2"], "regex": "^co2$"`}</code></pre>

        <h3><code>LONG_TEXT</code> · Resposta llarga de correcció manual</h3>
        <p><code>reference</code> és opcional i conté la resposta o els criteris de referència visibles al professorat; aquesta pregunta sempre es corregeix manualment.</p>
        <pre><code>{`"type": "LONG_TEXT", "reference": "Explica el procés i justifica'n les etapes."`}</code></pre>

        <h3><code>IMAGE_UPLOAD</code> · Lliurament d’una imatge</h3>
        <p>No té cap camp específic. L’alumne adjunta una imatge i el professorat la corregeix manualment. No confongueu aquest tipus amb <code>image</code>, que és una imatge de context de la pregunta.</p>
        <pre><code>{`"type": "IMAGE_UPLOAD"`}</code></pre>

        <h2>Document complet d’exemple</h2>
        <p>Aquest és un fitxer importable amb la configuració mínima explícita i dues preguntes. Es pot desar com a <code>.json</code> en UTF-8.</p>
        <pre className="format-example"><code>{example}</code></pre>

        <h2>Generació amb una LLM</h2>
        <p>Indiqueu a la LLM que retorni només un objecte JSON vàlid, sense blocs Markdown; demaneu <code>format: "smxform.quiz"</code>, <code>version: 1</code> i que cada opció inclogui explícitament <code>correct</code>. Les imatges necessiten dades base64 reals i coordenades mesurades, així que no demaneu a una LLM que inventi una data URI. Reviseu sempre la clau de respostes abans de publicar.</p>
        <p>Per importar: des de <Link to="/t">l’espai del professorat</Link>, trieu <strong>Importa JSON</strong>. La importació valida tot el document abans de crear l’entrega, puja les imatges incrustades i obre el resultat com a esborrany. El límit del fitxer és 50 MiB. Per exportar, feu servir <strong>Exporta JSON</strong> a l’editor d’una entrega.</p>
        <p className="format-back"><Link to="/">Torna a smxForm</Link></p>
      </article>
    </main>
  );
}