// FRONTIER — tabelas de dados partilhadas pelos dois modos.
// Todos os números de equilíbrio vivem aqui (padrão herdado do Outbreak: Patient Zero).

export const VERSION = '0.2.0-fase2';

export const MAP_SIZES = {
  expedition: { cols: 15, rows: 12, label: 'Expedição' },
  campaign:   { cols: 36, rows: 28, label: 'Campanha' }
};

// ===================== FASE 2 — regras do núcleo =====================
export const RULES = {
  PM: 5,                       // pontos de movimento por turno (afinado na simulação: 4 dava ~1 hexágono por turno)
  PM_TIRED: 3, PM_EXHAUSTED: 1,
  EXPLORE_EXTRA: 1,            // custo extra de entrar num hexágono ainda não explorado
  PACK: 6, PACK_UPGRADE: 2,    // espaços da mochila (só recursos)
  SUPPLIES: { campaign: 6, expedition: 8 },
  RESERVE: 3,                  // recolhas por hexágono por estação
  TERRITORY_RADIUS: 1,         // à volta de aldeia/posto: não se gasta mantimentos
  WARN_AUTONOMY: 2,            // aviso quando restam ≤ 2 turnos de autonomia
  HUNGER_COLLAPSE: { campaign: 4, expedition: 3 }, // turnos seguidos sem comida até à consequência grave
  CAMP_COST: { wood: 2 },
  OUTPOST_COST: { wood: 4, stone: 3, food: 2 }, OUTPOST_MIN_DIST: 3,
  MAX_EXPLORERS: 3,
  STORE_CAP: 30,
  WORK_RADIUS: 2, WORK_MAX_YIELD: 2,
  GROW: { food: 10, water: 5 }, MAX_POP: 12,
  EVENT_FROM_TURN: 3, EVENT_CHANCE: 0.25,
  EXPEDITION_TURNS: { normal: 12, long: 18, challenge: 15 },
  EXPEDITION_MEMBERS: 3,
  BASE_SUPPLIES: 6             // reserva de mantimentos no acampamento-base das expedições
};

export const CAMPAIGN_START = { pop: 5, explorers: 2, stock: { food: 16, wood: 10, stone: 4, ore: 0, gold: 5, water: 14 } };

export const UPGRADES = {
  pack:  { name: 'Mochilas maiores',   cost: { wood: 3, furs: 1 },  desc: '+2 espaços de carga para todos os exploradores.' },
  boots: { name: 'Botas reforçadas',   cost: { ore: 2, furs: 1 },   desc: '+1 ponto de movimento por turno.' },
  tools: { name: 'Ferramentas',        cost: { ore: 2, wood: 2 },   desc: 'Recolher rende +1 do recurso principal.' }
};
export const RECRUIT_COST = { food: 3, wood: 2, gold: 2 };

export const FOCUS = {
  food:      { name: 'Comida',      res: ['food', 'water'] },
  materials: { name: 'Materiais',   res: ['wood', 'stone', 'ore'] },
  balanced:  { name: 'Equilibrado', res: ['food', 'wood', 'stone', 'water', 'ore', 'gold'] }
};

// Valor de cada recurso (pontuação das expedições e prioridade ao encher a mochila)
export const VALUE = { food: 1, water: 1, wood: 1, stone: 1, ore: 2, gold: 3, herbs: 2, furs: 2, crystals: 5 };

// Traços de região: sorteados por região, revelados ao entrar.
export const TRAITS = {
  fertile:  { name: 'Terra Fértil',          biomes: ['greenlands'], desc: 'Planícies e rios dão +1 comida.', yield: { terrain: ['plain', 'river'], res: 'food', add: 1 } },
  oldwood:  { name: 'Bosque Antigo',         biomes: ['greenlands', 'icelands'], desc: 'Florestas dão +1 madeira, mas custam +1 PM.', yield: { terrain: ['forest', 'woods'], res: 'wood', add: 1 }, move: { terrain: ['forest'], add: 1 } },
  iron:     { name: 'Veios de Ferro',        biomes: ['drylands', 'greenlands', 'icelands'], needs: ['hills', 'mountains'], desc: 'Colinas e montanhas dão +1 minério.', yield: { terrain: ['hills', 'mountains'], res: 'ore', add: 1 } },
  springs:  { name: 'Nascentes',             biomes: ['greenlands', 'drylands', 'icelands', 'deadlands'], desc: 'Fora do território gasta-se metade dos mantimentos.', supply: 'half' },
  caravans: { name: 'Rota de Caravanas',     biomes: ['sandlands', 'drylands'], desc: 'Ouro a dobrar nos locais especiais desta região.', gold: 2 },
  icewind:  { name: 'Ventos Gelados',        biomes: ['icelands'], desc: '+1 mantimento por turno, mas peles a dobrar.', supply: 'plus1', yield: { terrain: ['plain', 'woods', 'forest', 'hills'], res: 'furs', add: 1 } },
  haunted:  { name: 'Terra Assombrada',      biomes: ['deadlands'], desc: 'Mais acontecimentos sombrios; cristais a dobrar.', yield: { terrain: ['mountains', 'hills', 'plain'], res: 'crystals', add: 1 } },
  ruinsland:{ name: 'Ruínas por Todo o Lado', biomes: ['greenlands', 'sandlands', 'drylands'], desc: 'Os locais especiais dão mais, mas investigar é mais arriscado.', poiBonus: 1 }
};

export const EXPLORER_NAMES = ['Aldo', 'Ines', 'Berin', 'Kay', 'Liv', 'Robin', 'Dana', 'Coal', 'Faris', 'Mayr', 'Sumyr', 'Iven', 'Jael', 'Wes'];
export const EXPLORER_COLORS = ['#b5452f', '#2f6db5', '#3f8f3a', '#8a4fb0'];


// Paletas de bioma = atlas de cor do pacote "foundation tiles" de C. Martins.
export const BIOMES = {
  greenlands: { name: 'Terras Verdes',  adj: 'verdejante', pack: 'forest' },
  sandlands:  { name: 'Areais',          adj: 'arenoso',    pack: 'desert' },
  drylands:   { name: 'Terras Secas',    adj: 'árido',      pack: 'mountain' },
  icelands:   { name: 'Terras Geladas',  adj: 'gelado',     pack: 'tundra' },
  deadlands:  { name: 'Terras Mortas',   adj: 'amaldiçoado', pack: null }
};

export const RESOURCES = {
  food:  { name: 'Comida',   icon: 'i-food' },
  wood:  { name: 'Madeira',  icon: 'i-wood' },
  stone: { name: 'Pedra',    icon: 'i-stone' },
  ore:   { name: 'Minério',  icon: 'i-ore' },
  gold:  { name: 'Ouro',     icon: 'i-gold' },
  water: { name: 'Água',     icon: 'i-water' },
  herbs: { name: 'Ervas',    icon: 'i-herbs', rare: true },
  furs:  { name: 'Peles',    icon: 'i-furs', rare: true },
  crystals: { name: 'Cristais', icon: 'i-crystal', rare: true }
};
export const BASE_RESOURCES = ['food', 'wood', 'stone', 'ore', 'gold', 'water'];
export const START_STOCK = { food: 20, wood: 15, stone: 5, ore: 0, gold: 10, water: 20 };

// Terreno base de cada hexágono (independente do bioma).
export const TERRAINS = {
  plain:     { name: 'Planície',  move: 1, yields: { food: 2, water: 1 },          desc: 'Terra aberta, boa para quintas e pastagens.' },
  woods:     { name: 'Bosque',    move: 1, yields: { wood: 1, food: 1, water: 1 },  desc: 'Árvores dispersas. Lenha fácil e alguma caça.' },
  forest:    { name: 'Floresta',  move: 2, yields: { wood: 3, food: 1, herbs: 1 },  desc: 'Mata cerrada. Muita madeira, caminhos lentos.' },
  hills:     { name: 'Colinas',   move: 2, yields: { stone: 2, ore: 1 },            desc: 'Encostas pedregosas. Pedreiras e vistas largas.' },
  mountains: { name: 'Montanhas', move: 3, yields: { stone: 2, ore: 2, crystals: 1 }, desc: 'Picos difíceis de atravessar, ricos em minério.' },
  lake:      { name: 'Lago',      move: 9, yields: { water: 3, food: 1 },           desc: 'Água doce. Ninguém passa fome junto a um lago.' },
  river:     { name: 'Rio',       move: 2, yields: { water: 2, food: 2 },           desc: 'Terras férteis nas margens. Atravessar custa tempo.' },
  swamp:     { name: 'Pântano',   move: 3, yields: { herbs: 2, water: 1 },          desc: 'Lodo, névoa e ervas raras.' },
  water:     { name: 'Oceano',    move: 99, yields: { food: 1 },                    desc: 'O mar que rodeia o continente. Pesca, um dia.' }
};

// Modificadores por bioma, somados ao terreno.
export const BIOME_YIELDS = {
  greenlands: { food: 1 },
  sandlands:  { food: -1, water: -1, gold: 1 },
  drylands:   { food: -1, stone: 1 },
  icelands:   { food: -1, furs: 1 },
  deadlands:  { food: -2, water: -1, crystals: 1 }
};

// Locais especiais (POI). Cada um corresponde a um tile real do pacote.
// w = peso, on = terrenos onde pode aparecer, biomes = preferência (opcional), rare = no máximo 1–2 por mapa.
export const POIS = {
  ruins:     { name: 'Ruínas antigas',      w: 4, on: ['plain', 'woods', 'hills'],             desc: 'Pedras de uma civilização esquecida. Quem as ergueu?', yields: { stone: 1 } },
  cave:      { name: 'Caverna',             w: 5, on: ['hills', 'mountains'],                   desc: 'Uma boca escura na rocha. Abrigo — ou covil.', yields: { ore: 1 } },
  stones:    { name: 'Círculo de pedras',   w: 3, on: ['plain', 'hills'],                       desc: 'Dólmenes antigos. O ar vibra aqui.' },
  graveyard: { name: 'Ossadas',             w: 3, on: ['plain'], biomes: ['sandlands', 'drylands', 'deadlands'], desc: 'Esqueletos meio enterrados. Algo correu mal aqui.' },
  hole:      { name: 'Fenda no chão',       w: 3, on: ['plain', 'woods'],                       desc: 'Um poço sem fundo visível. Ecos estranhos sobem lá de baixo.' },
  deadtrees: { name: 'Árvores mortas',      w: 4, on: ['plain', 'woods'], biomes: ['drylands', 'deadlands', 'icelands'], desc: 'Troncos secos e silêncio.', yields: { wood: 1 } },
  village:   { name: 'Aldeia abandonada',   w: 3, on: ['plain', 'woods'],                       desc: 'Casas vazias, portas abertas. Ainda há coisas úteis lá dentro.' },
  camp:      { name: 'Acampamento nómada',  w: 3, on: ['plain'],                                desc: 'Tendas de viajantes. Talvez troquem mantimentos.' },
  tower:     { name: 'Torre em ruínas',     w: 2, on: ['plain', 'hills'],                       desc: 'Uma velha torre de vigia. Do topo vê-se longe.' },
  crystals:  { name: 'Veio de cristais',    w: 3, on: ['mountains', 'hills'], biomes: ['icelands', 'drylands', 'deadlands'], desc: 'Cristais rosados a brotar da pedra.', yields: { crystals: 2 } },
  keep:      { name: 'Fortaleza esquecida', w: 1, on: ['hills', 'plain'], rare: true,          desc: 'Muralhas intactas, sem bandeira. Quem a defendia?' },
  wonder:    { name: 'Pirâmide',            w: 1, on: ['plain'], biomes: ['sandlands'], rare: true, desc: 'Uma maravilha de outra era, meio coberta de areia.', yields: { gold: 2 } },
  floating:  { name: 'Ilha flutuante',      w: 1, on: ['plain', 'hills'], rare: true,          desc: 'Um pedaço de terra a pairar no céu. Impossível — e no entanto…' },
  vulcano:   { name: 'Vulcão',              w: 1, on: ['mountains'], rare: true,               desc: 'A montanha respira fumo. Terra fértil à volta, perigo por cima.', yields: { ore: 2 } },
  portal:    { name: 'Portal mágico',       w: 1, on: ['plain', 'woods'], rare: true, far: true, desc: 'Uma porta de pedra com uma espiral viva. Para onde levará?' }
};

// Estruturas do jogador (Fase 3) — só a aldeia inicial é usada na Fase 1.
export const STRUCTURES = {
  village: { name: 'A tua aldeia', desc: 'O ponto de partida da expedição. Daqui se vê o desconhecido.' },
  farms:   { name: 'Quinta' },
  tower:   { name: 'Torre de vigia' },
  keep:    { name: 'Castelo' },
  city:    { name: 'Cidade' },
  camp:    { name: 'Acampamento' }
};

export const SEASONS = ['Primavera', 'Verão', 'Outono', 'Inverno'];
export const TURNS_PER_SEASON = 6;

// Tabelas de nomes "PAST — Printable Adventures & Systemless Tools" (C. Martins): Municipality prefix × suffix.
export const NAME_PREFIX = ['Alb','Arg','Avin','Baba','Bel','Bessa','Dag','Dro','Frat','Grim','Hu','Id','Kila','Luz','Mus','Nam','No','Nyl','Ok','Ora','Pela','Quan','Ro','To','Tud','Ura','Volk','Wet','Y','Zar'];
export const NAME_SUFFIX = ['ander','bridge','burg','chester','dur','ella','ene','eria','esse','field','fort','gard','gate','hill','horn','isa','land','las','ledo','let','more','mouth','nia','olva','port','spire','stone','tra','vale','yard'];

// Ilustração grande do painel de informação: pacotes de bioma de C. Martins (hexágonos pontiagudos).
// Chave = poi | estrutura | terreno. Sem correspondência → usa-se o próprio tile do mapa ampliado.
export const VIGNETTES = {
  // (sem alterações na Fase 2)
  forest: {
    plain: 'fewTrees', woods: 'tree', forest: 'full', hills: 'hill', cave: 'cave', stones: 'stones', village: 'village',
    camp: 'house', tower: 'watchTower', ruins: 'ruins', hole: 'blast', deadtrees: 'dead', swamp: 'mushroom',
    wonder: 'temple', keep: 'temple', river: 'road', portal: 'clearing'
  },
  desert: {
    plain: 'full', woods: 'cactus', forest: 'hillsAndTrees', hills: 'fewSand', mountains: 'barrier', lake: 'oasis',
    hole: 'hole', cave: 'cave', graveyard: 'graveyard', floating: 'floatingIsland', village: 'village', camp: 'house',
    tower: 'watchTower', ruins: 'ruins', wonder: 'temple', deadtrees: 'dry', river: 'road', stones: 'clearing'
  },
  mountain: {
    plain: 'fewMount', woods: 'forest', forest: 'forest', hills: 'hills', mountains: 'full', vulcano: 'vulcano',
    cave: 'cave', crystals: 'obelisk', village: 'village', camp: 'house', tower: 'watchTower', ruins: 'ruins',
    hole: 'blast', wonder: 'temple', floating: 'plateau', keep: 'gates', river: 'bridge', stones: 'spikes'
  },
  tundra: {
    plain: 'full', woods: 'few', forest: 'forest', hills: 'shatteredLand', mountains: 'summit', cave: 'cave',
    crystals: 'shards', village: 'village', camp: 'house', tower: 'tower', ruins: 'ruins', hole: 'blast',
    wonder: 'temple', river: 'iceBridge', deadtrees: 'barrier', keep: 'temple', stones: 'iceblock'
  }
};
