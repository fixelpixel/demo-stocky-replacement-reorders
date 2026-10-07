import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { approve } from './approval.mjs';
import { generate } from './output.mjs';
import { requireValue } from './validation.mjs';

const usage = `Node 22 offline demo. No network, stock writes or email delivery.
  node src/cli.mjs generate --input fixtures --out NEW_DIRECTORY
  node src/cli.mjs approve --po FILE.json --sha256 REVIEWED_DIGEST --reviewer demo-operator --out NEW_APPROVAL.json
The output directory's parent must exist. Existing outputs are never overwritten.`;

try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: 'string' }, out: { type: 'string' }, po: { type: 'string' },
      sha256: { type: 'string' }, reviewer: { type: 'string' }, help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(usage);
  } else {
    requireValue(positionals.length === 1, usage);
    switch (positionals[0]) {
      case 'generate': {
        requireValue(values.input && values.out && !values.po && !values.sha256 && !values.reviewer, usage);
        const run = await generate(values.input, values.out);
        console.log(JSON.stringify({ output: values.out, ...run }, null, 2));
        break;
      }
      case 'approve': {
        requireValue(values.po && values.out && values.sha256 && values.reviewer && !values.input, usage);
        const approval = approve(await readFile(values.po), { sha256: values.sha256, reviewer: values.reviewer });
        await writeFile(values.out, JSON.stringify(approval, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify(approval, null, 2));
        break;
      }
      default:
        throw new Error(usage);
    }
  }
} catch (error) {
  if (!(error instanceof Error)) throw error;
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
}
