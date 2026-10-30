# FRONTIER — Realms of the Unknown

**Explora um mundo desconhecido. Descobre novos territórios. Constrói o teu reino.**

FRONTIER é um jogo independente de exploração e estratégia num mundo de fantasia gerado proceduralmente, representado através de um mapa hexagonal. Está a ser desenvolvido em HTML, CSS e JavaScript, sem frameworks externos, com uma experiência adaptada a telemóveis, tablets e computadores.

<p align="center">
  <a href="https://bolinhared.github.io/Frontier2.0/"><strong>▶ JOGAR FRONTIER</strong></a>
</p>

**Versão:** 0.1.0  
**Estado:** Fase 1 — protótipo do mapa  
**Plataforma:** Navegador (PC, tablet e telemóvel) · PWA

---

## Jogar

A versão publicada está disponível em:

**https://bolinhared.github.io/Frontier2.0/**

No Android, abre o endereço no Chrome e, se a opção estiver disponível, escolhe **Instalar aplicação** ou **Adicionar ao ecrã principal** no menu do navegador.

## Funcionalidades atuais

- **Mundo procedural:** mapas gerados por seed, com continente, oceanos, cadeias montanhosas, florestas, desertos, regiões geladas, lagos, rios e Terras Mortas.
- **Mapa hexagonal:** coordenadas axiais e renderização em Canvas.
- **Exploração:** sistema de névoa de guerra com três estados — desconhecido, descoberto e explorado.
- **Visibilidade:** colinas, montanhas e torres podem aumentar o alcance de visão.
- **Interação:** zoom e deslocação por toque, rato e teclado.
- **Interface adaptável:** painel de informação e controlos preparados para ecrãs pequenos.
- **Partidas e gravações:** campanha com gravação automática, expedição de 20 turnos, pontuação provisória e recordes.
- **Importar/exportar:** possibilidade de guardar e recuperar partidas através de ficheiros JSON.
- **PWA:** manifesto e Service Worker para permitir a instalação e a utilização offline dos recursos em cache.

## Executar localmente

O projeto utiliza módulos JavaScript ES. Por isso, não abras o `index.html` diretamente com duplo clique: inicia um servidor HTTP na pasta do projeto.

Com Python 3 instalado:

```bash
python3 -m http.server 8000
```

Depois abre no navegador:

```text
http://localhost:8000
```

## Estrutura do projeto

```text
frontier/
├── index.html
├── manifest.json
├── service-worker.js
├── ASSETS.md
├── css/
│   ├── style.css
│   ├── map.css
│   └── interface.css
├── js/
│   ├── data.js
│   ├── rng.js
│   ├── hex-coordinates.js
│   ├── map-generator.js
│   ├── exploration.js
│   ├── resources.js
│   ├── assets.js
│   ├── map-engine.js
│   ├── ui.js
│   ├── save-system.js
│   └── main.js
├── assets/
│   ├── atlas/
│   ├── fonts/
│   ├── icons/
│   └── ui/
└── tools/
```

### Principais módulos

| Ficheiro | Função |
|---|---|
| `data.js` | Dados de biomas, terrenos, recursos e locais. |
| `rng.js` | Geração aleatória determinística por seed. |
| `hex-coordinates.js` | Coordenadas, vizinhos, distâncias e conversões do mapa hexagonal. |
| `map-generator.js` | Geração procedural do continente. |
| `exploration.js` | Exploração e estados da névoa de guerra. |
| `resources.js` | Dados de rendimento dos terrenos. |
| `assets.js` | Carregamento dos atlas e ilustrações. |
| `map-engine.js` | Desenho do mapa, câmara e interação. |
| `ui.js` | Interface, painéis e janelas. |
| `save-system.js` | Gravação local e importação/exportação de partidas. |
| `main.js` | Inicialização e fluxo principal do jogo. |

## Gravações

O mapa é reconstruído a partir da seed, em vez de guardar todos os hexágonos individualmente. O sistema de gravação conserva o estado necessário para retomar a partida, incluindo o turno, a exploração, a câmara e as descobertas. As gravações são armazenadas localmente no navegador; limpar os dados do site pode apagá-las. Exporta regularmente uma cópia JSON se quiseres salvaguardar uma partida.

## Desenvolvimento previsto

O desenvolvimento está organizado por fases. As funcionalidades abaixo são objetivos futuros e não devem ser entendidas como já implementadas nesta versão.

1. **Fase 1 — Protótipo do mapa:** geração do mundo, mapa hexagonal, exploração inicial, interface e gravações.
2. **Fase 2 — Exploração e recursos:** exploradores, pontos de movimento, recolha de recursos e produção por turnos.
3. **Fase 3 — Construção e população:** aldeias, edifícios, armazéns e expansão.
4. **Fase 4 — Expedições:** objetivos variados, acontecimentos e pontuação final.
5. **Fase 5 — Campanha:** tecnologias, missões, estações e acontecimentos com escolhas.
6. **Fase 6 — Polimento:** otimização, testes e publicação.

## Depuração

Na consola do navegador, o jogo disponibiliza referências úteis para diagnóstico:

```javascript
FRONTIER.game // estado da partida
FRONTIER.view // câmara e desenho do mapa
```

## Créditos e licenças

- **Ilustrações e recursos gráficos:** Carlos Martins — [cmartins.itch.io](https://cmartins.itch.io/). Consultar as condições de atribuição/licença dos recursos utilizados.
- **Tipografia:** IM Fell English SC e Alegreya — SIL Open Font License (OFL).
- **Tecnologias:** HTML, CSS, JavaScript ES Modules, Canvas API e APIs do navegador.

---

*FRONTIER — um mundo desconhecido à espera de ser explorado.*
