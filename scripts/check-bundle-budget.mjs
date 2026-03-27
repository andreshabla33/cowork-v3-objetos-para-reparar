import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DIST_ASSETS_DIR = join(process.cwd(), 'dist', 'assets');

const BYTES = {
  MB: 1024 * 1024,
};

const BUDGETS = {
  maxSingleJsAssetBytes: 2.5 * BYTES.MB,
  maxTotalJsAssetsBytes: 8 * BYTES.MB,
};

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const main = async () => {
  const files = await readdir(DIST_ASSETS_DIR);
  const jsFiles = files.filter((file) => file.endsWith('.js'));

  if (jsFiles.length === 0) {
    throw new Error('No JS assets found in dist/assets. Run build first.');
  }

  const sizes = await Promise.all(
    jsFiles.map(async (file) => {
      const fullPath = join(DIST_ASSETS_DIR, file);
      const fileStat = await stat(fullPath);
      return { file, size: fileStat.size };
    }),
  );

  sizes.sort((a, b) => b.size - a.size);

  const totalJs = sizes.reduce((acc, current) => acc + current.size, 0);
  const largest = sizes[0];

  const errors = [];

  if (largest.size > BUDGETS.maxSingleJsAssetBytes) {
    errors.push(
      `Largest JS asset exceeds budget: ${largest.file} (${formatBytes(largest.size)} > ${formatBytes(BUDGETS.maxSingleJsAssetBytes)})`,
    );
  }

  if (totalJs > BUDGETS.maxTotalJsAssetsBytes) {
    errors.push(
      `Total JS assets exceed budget: ${formatBytes(totalJs)} > ${formatBytes(BUDGETS.maxTotalJsAssetsBytes)}`,
    );
  }

  console.log('Bundle budget report');
  console.log(`- Largest JS asset: ${largest.file} (${formatBytes(largest.size)})`);
  console.log(`- Total JS assets: ${formatBytes(totalJs)}`);

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }
    process.exit(1);
  }

  console.log('Bundle budgets: OK');
};

main().catch((error) => {
  console.error('Bundle budget check failed:', error);
  process.exit(1);
});
