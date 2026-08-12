# Implantação na estação de trabalho

## Objetivo

Executar a extensão compilada na estação corporativa sem instalar Node.js, npm ou dependências de desenvolvimento.

## Regra de segurança

A estação corporativa recebe somente o conteúdo produzido em `dist/`, empacotado pelo script `scripts/package-workstation.ps1`. O banco SQLite real e arquivos corporativos não devem ser publicados no GitHub nem incluídos no pacote.

## Preparação em casa

No PowerShell, na raiz do repositório:

```powershell
cd C:\EGBA\download-edicoes-doe
git switch release/workstation
git pull
.\scripts\package-workstation.ps1
```

O script:

1. executa `npm test`;
2. executa `npm run build`;
3. recusa a build se `dist/offscreen.js` contiver `chrome.storage`;
4. copia apenas a extensão compilada para uma área de staging;
5. gera `release/download-edicoes-doe-<versao>.zip`;
6. gera o respectivo SHA-256.

## Transferência remota

Use somente um canal autorizado pela empresa, por exemplo:

- redirecionamento de arquivos do Remote Desktop/RDP;
- pasta de rede corporativa;
- OneDrive/SharePoint corporativo, se permitido;
- outro mecanismo de transferência aprovado pela TI.

Não é necessário copiar o repositório Git nem `node_modules` para a estação.

## Instalação manual no Chrome da estação

1. Extraia o ZIP em uma pasta permanente do perfil do usuário, por exemplo:
   `C:\Users\<usuario>\AppData\Local\DownloadEdicoesDOE\extension`.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta `extension` extraída.
6. Abra o EGBANET, autentique-se normalmente e abra o Side Panel da extensão.
7. Confira o badge de versão antes de usar.

### Atualização futura

Substitua o conteúdo da pasta permanente pela nova pasta `extension`, mantendo o mesmo caminho, e clique em **Recarregar** no cartão da extensão em `chrome://extensions`.

## Se o Chrome corporativo bloquear a instalação

Se `Modo do desenvolvedor` ou `Carregar sem compactação` estiver desabilitado por política, não há procedimento legítimo no perfil comum que contorne isso. A TI precisará distribuir a extensão por política do Chrome Enterprise, normalmente via `ExtensionInstallForcelist`/gestão corporativa equivalente.

Não altere políticas locais, registro do Windows ou controles corporativos para contornar a restrição.

## Dados locais

O SQLite em OPFS e as permissões de pasta pertencem ao perfil do Chrome na estação. Eles não vêm no ZIP de implantação. Na primeira instalação na estação, faça a sincronização/captura ou importe os dados por um fluxo explicitamente homologado quando disponível.

A pasta escolhida para downloads deve ser uma pasta local ou compartilhamento acessível pelo usuário e aceito pelo File System Access API do Chrome.
