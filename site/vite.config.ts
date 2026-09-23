import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

const file = (path:string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({mode}) => ({
  base: mode === 'pages' ? '/Portfolio/' : '/',
  build: {
    rolldownOptions: {
      input: mode === 'pages'
        ? {index: file('./index.html')}
        : {
            index: file('./index.html'),
            inkStudy: file('./ink-study.html'),
          },
    },
  },
}));
