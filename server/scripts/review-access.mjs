// Reviewer secrets belong outside this public app checkout.
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
export function reviewAccessPath({ plugin = false, local = false } = {}) {
  const directory = resolve(process.env.QUIZ_REVIEW_ACCESS_DIR ||
    resolve(appRoot, '../00quiz-www/.private/reviewer-access'));
  const fromApp = relative(appRoot, directory);
  if (!fromApp || (!fromApp.startsWith('..' + '/') && fromApp !== '..' && !isAbsolute(fromApp))) {
    throw new Error('QUIZ_REVIEW_ACCESS_DIR must be outside the public 00quiz checkout');
  }
  return resolve(directory, `${plugin ? 'openai' : 'appstore'}${local ? '.local' : ''}.json`);
}
