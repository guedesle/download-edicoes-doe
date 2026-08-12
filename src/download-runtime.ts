export const EGBANET_ORIGIN = 'https://egbanet.egba.ba.gov.br';

const DOWNLOAD_PATH = /^\/admin\/edicoes\/download_versao\/\d+_\d+\/[01]$/;
const SAFE_SEGMENT = /^[^\\/:*?"<>|.][^\\/:*?"<>|]*$/;

export function resolveEditionDownloadUrl(input: string): string {
  const url = new URL(input, EGBANET_ORIGIN);
  if (url.origin !== EGBANET_ORIGIN || !DOWNLOAD_PATH.test(url.pathname)) {
    throw new Error(`URL de download inválida: ${input}`);
  }
  return url.href;
}

export function splitDownloadRelativePath(relativePath: string): {
  directories: string[];
  filename: string;
} {
  if (!relativePath || relativePath.includes('\\')) {
    throw new Error(`Caminho relativo inválido: ${relativePath}`);
  }

  const segments = relativePath.split('/');
  if (segments.length < 2 || segments.some((segment) => !segment || segment === '.' || segment === '..' || !SAFE_SEGMENT.test(segment))) {
    throw new Error(`Caminho relativo inválido: ${relativePath}`);
  }

  const filename = segments.at(-1)!;
  if (!filename.toLowerCase().endsWith('.pdf')) {
    throw new Error(`Arquivo de destino inválido: ${filename}`);
  }

  return {
    directories: segments.slice(0, -1),
    filename
  };
}
