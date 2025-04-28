import { extname, relative, resolve } from 'path';
import { defineConfig } from 'vite';
import { glob } from 'glob';
import { fileURLToPath } from 'url';
import { libInjectCss } from 'vite-plugin-lib-inject-css';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import dts from 'vite-plugin-dts';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [libInjectCss(), vanillaExtractPlugin(), tsconfigPaths(), dts({ include: ['src'] })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      fileName: (format, entryName) => `${entryName}.${format}.js`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      input: Object.fromEntries(
        glob
          .sync('src/**/*.{ts,tsx,css}', {
            ignore: ['src/**/*.d.ts'],
          })
          .map((file) => [
            // 1. The name of the entry point
            relative('src', file.slice(0, file.length - extname(file).length)),
            // 2. The absolute path to the entry file
            fileURLToPath(new URL(file, import.meta.url)),
          ]),
      ),
      output: {
        chunkFileNames: 'chunks/[name].[hash].js',
        assetFileNames: 'assets/[name][extname]',
        entryFileNames: '[name].[format].js',
      },
    },
  },
});
