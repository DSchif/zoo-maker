import type { Game } from '../core/Game';
import type { FoliageType, TerrainType } from '../core/types';

/**
 * Foliage type data definition
 */
interface FoliageTypeData {
    id: FoliageType;
    name: string;
    icon: string;
    biome: string;
    cost: number;
    tileSpace: number;
    height: 'low' | 'medium' | 'tall';
    description: string;
    allowedTerrains: TerrainType[];
}

/**
 * Foliage data definitions
 */
export const FoliageTypes: Record<FoliageType, FoliageTypeData> = {
    // Savannah biome - African
    thorn_bush: {
        id: 'thorn_bush',
        name: 'Thorn Bush',
        icon: '🌿',
        biome: 'savanna_grass',
        cost: 20,
        tileSpace: 0.25,
        height: 'low',
        description: 'Spiny bush common in African savannas',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    tall_grass: {
        id: 'tall_grass',
        name: 'Tall Grass',
        icon: '🌾',
        biome: 'savanna_grass',
        cost: 75,
        tileSpace: 0.5,
        height: 'medium',
        description: 'Golden grass typical of African savannas',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass', 'prairie'],
    },
    senegal_date_palm: {
        id: 'senegal_date_palm',
        name: 'Senegal Date Palm',
        icon: '🌴',
        biome: 'savanna_grass',
        cost: 120,
        tileSpace: 0.15,
        height: 'tall',
        description: 'Elegant palm tree native to the Sahel region',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    acacia_caffra: {
        id: 'acacia_caffra',
        name: 'Acacia Caffra Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 125,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Common hook-thorn acacia of southern Africa',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    thorn_acacia: {
        id: 'thorn_acacia',
        name: 'Thorn Acacia Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 150,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Thorny acacia with distinctive white bark',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    yellow_fever_tree: {
        id: 'yellow_fever_tree',
        name: 'Yellow Fever Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 175,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Striking yellow-barked acacia tree',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    umbrella_thorn: {
        id: 'umbrella_thorn',
        name: 'Umbrella Thorn Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 210,
        tileSpace: 0.35,
        height: 'tall',
        description: 'Iconic flat-topped African acacia',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    baobab: {
        id: 'baobab',
        name: 'Baobab Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 300,
        tileSpace: 0.5,
        height: 'tall',
        description: 'Massive tree with a distinctive swollen trunk',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    // Savannah biome - Indian
    khejri: {
        id: 'khejri',
        name: 'Khejri Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 165,
        tileSpace: 0.15,
        height: 'tall',
        description: 'Hardy desert tree native to India',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    // Savannah biome - Prehistoric
    sigillaria: {
        id: 'sigillaria',
        name: 'Sigillaria Tree',
        icon: '🌴',
        biome: 'savanna_grass',
        cost: 150,
        tileSpace: 0.15,
        height: 'tall',
        description: 'Ancient tree-like plant from the Carboniferous period',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass', 'rainforest_floor'],
    },
    // Savannah biome - Australian
    grass_tree: {
        id: 'grass_tree',
        name: 'Grass Tree',
        icon: '🌴',
        biome: 'savanna_grass',
        cost: 125,
        tileSpace: 0.2,
        height: 'medium',
        description: 'Unique Australian plant with grass-like foliage',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    red_gum: {
        id: 'red_gum',
        name: 'Red Gum Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 175,
        tileSpace: 0.35,
        height: 'tall',
        description: 'Large eucalyptus with smooth bark',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    hard_quandong: {
        id: 'hard_quandong',
        name: 'Hard Quandong Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 200,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Australian native with edible fruit',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },
    eucalyptus: {
        id: 'eucalyptus',
        name: 'Eucalyptus Tree',
        icon: '🌳',
        biome: 'savanna_grass',
        cost: 225,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Tall aromatic tree beloved by koalas',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass'],
    },

    // Prairie biome
    prairie_grass: {
        id: 'prairie_grass',
        name: 'Prairie Grass',
        icon: '🌿',
        biome: 'prairie',
        cost: 20,
        tileSpace: 0.5,
        height: 'medium',
        description: 'Native North American prairie grass',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass', 'prairie'],
    },
    shrub: {
        id: 'shrub',
        name: 'Prairie Shrub',
        icon: '🌲',
        biome: 'prairie',
        cost: 75,
        tileSpace: 0.15,
        height: 'medium',
        description: 'Hardy shrub found in open grasslands',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass', 'prairie'],
    },
    wildflowers: {
        id: 'wildflowers',
        name: 'Wildflowers',
        icon: '🌸',
        biome: 'prairie',
        cost: 30,
        tileSpace: 0.25,
        height: 'low',
        description: 'Colorful native prairie wildflowers',
        allowedTerrains: ['grass', 'dirt', 'sand', 'savanna_grass', 'prairie'],
    },

    // Grassland biome
    broadleaf_bush: {
        id: 'broadleaf_bush',
        name: 'Broadleaf Bush',
        icon: '🌿',
        biome: 'grass',
        cost: 65,
        tileSpace: 0.2,
        height: 'medium',
        description: 'Dense bush with broad green leaves native to North America',
        allowedTerrains: ['grass', 'dirt', 'prairie', 'savanna_grass'],
    },
    monkey_puzzle_tree: {
        id: 'monkey_puzzle_tree',
        name: 'Monkey Puzzle Tree',
        icon: '🌲',
        biome: 'grass',
        cost: 180,
        tileSpace: 0.3,
        height: 'tall',
        description: 'Ancient conifer with distinctive spiky branches from the Cretaceous period',
        allowedTerrains: ['grass', 'dirt', 'prairie', 'savanna_grass', 'rainforest_floor'],
    },

    // Deciduous forest biome
    thornless_mesquite: {
        id: 'thornless_mesquite',
        name: 'Thornless Mesquite Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 125,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Spreading shade tree native to South America',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'savanna_grass'],
    },
    maple_tree: {
        id: 'maple_tree',
        name: 'Maple Tree',
        icon: '🍁',
        biome: 'deciduous_floor',
        cost: 100,
        tileSpace: 0.3,
        height: 'tall',
        description: 'Classic North American tree with vibrant fall colors',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    elm_tree: {
        id: 'elm_tree',
        name: 'Elm Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 125,
        tileSpace: 0.3,
        height: 'tall',
        description: 'Stately shade tree with vase-shaped canopy',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    gingko_tree: {
        id: 'gingko_tree',
        name: 'Gingko Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 125,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Ancient tree species with distinctive fan-shaped leaves',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'rainforest_floor'],
    },
    weeping_willow: {
        id: 'weeping_willow',
        name: 'Weeping Willow Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 130,
        tileSpace: 0.4,
        height: 'tall',
        description: 'Graceful tree with long drooping branches',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    birch_tree: {
        id: 'birch_tree',
        name: 'Birch Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 145,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Elegant tree with distinctive white bark',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'coniferous_floor'],
    },
    white_oak: {
        id: 'white_oak',
        name: 'White Oak Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 150,
        tileSpace: 0.35,
        height: 'tall',
        description: 'Majestic oak with spreading crown and lobed leaves',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    cherry_tree: {
        id: 'cherry_tree',
        name: 'Cherry Tree',
        icon: '🌸',
        biome: 'deciduous_floor',
        cost: 175,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Beautiful flowering tree with pink blossoms',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    trembling_aspen: {
        id: 'trembling_aspen',
        name: 'Trembling Aspen Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 200,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Slender tree whose leaves quiver in the slightest breeze',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'coniferous_floor'],
    },
    bonsai: {
        id: 'bonsai',
        name: 'Bonsai',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 75,
        tileSpace: 0.1,
        height: 'low',
        description: 'Miniature ornamental tree from Asia',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'gray_stone'],
    },
    snowbell_tree: {
        id: 'snowbell_tree',
        name: 'Snowbell Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 120,
        tileSpace: 0.15,
        height: 'medium',
        description: 'Small Asian tree with bell-shaped white flowers',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    japanese_maple: {
        id: 'japanese_maple',
        name: 'Japanese Maple Tree',
        icon: '🍁',
        biome: 'deciduous_floor',
        cost: 135,
        tileSpace: 0.2,
        height: 'medium',
        description: 'Ornamental tree with delicate red leaves',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    deciduous_bush: {
        id: 'deciduous_bush',
        name: 'Deciduous Bush',
        icon: '🌿',
        biome: 'deciduous_floor',
        cost: 35,
        tileSpace: 0.15,
        height: 'low',
        description: 'Common leafy shrub found in European forests',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'coniferous_floor'],
    },
    glossopteris: {
        id: 'glossopteris',
        name: 'Glossopteris Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 185,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Prehistoric seed fern from the Triassic period',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'rainforest_floor'],
    },
    magnolia_tree: {
        id: 'magnolia_tree',
        name: 'Magnolia Tree',
        icon: '🌸',
        biome: 'deciduous_floor',
        cost: 185,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Ancient flowering tree with large fragrant blossoms',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    globe_willow: {
        id: 'globe_willow',
        name: 'Globe Willow Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 210,
        tileSpace: 0.35,
        height: 'tall',
        description: 'Round-crowned willow with dense spherical canopy',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor'],
    },
    wild_olive: {
        id: 'wild_olive',
        name: 'Wild Olive Tree',
        icon: '🌳',
        biome: 'deciduous_floor',
        cost: 120,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Gnarled Mediterranean tree with silvery leaves',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'sand'],
    },
    pacific_dogwood: {
        id: 'pacific_dogwood',
        name: 'Pacific Dogwood Tree',
        icon: '🌸',
        biome: 'deciduous_floor',
        cost: 125,
        tileSpace: 0.2,
        height: 'medium',
        description: 'Beautiful flowering tree from Western North America',
        allowedTerrains: ['grass', 'dirt', 'deciduous_floor', 'coniferous_floor'],
    },

    // Coniferous forest biome
    pine_bush: {
        id: 'pine_bush',
        name: 'Pine Bush',
        icon: '🌲',
        biome: 'coniferous_floor',
        cost: 85,
        tileSpace: 0.15,
        height: 'low',
        description: 'Hardy evergreen shrub from Siberia',
        allowedTerrains: ['grass', 'dirt', 'coniferous_floor', 'snow'],
    },
    pine_tree: {
        id: 'pine_tree',
        name: 'Pine Tree',
        icon: '🌲',
        biome: 'coniferous_floor',
        cost: 100,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Classic North American evergreen with long needles',
        allowedTerrains: ['grass', 'dirt', 'coniferous_floor'],
    },
    fir_tree: {
        id: 'fir_tree',
        name: 'Fir Tree',
        icon: '🌲',
        biome: 'coniferous_floor',
        cost: 125,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Symmetrical conifer with soft needles',
        allowedTerrains: ['grass', 'dirt', 'coniferous_floor', 'snow'],
    },
    chinese_fir: {
        id: 'chinese_fir',
        name: 'Chinese Fir Tree',
        icon: '🌲',
        biome: 'coniferous_floor',
        cost: 125,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Elegant conifer native to China',
        allowedTerrains: ['grass', 'dirt', 'coniferous_floor'],
    },
    yew_tree: {
        id: 'yew_tree',
        name: 'Yew Tree',
        icon: '🌲',
        biome: 'coniferous_floor',
        cost: 125,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Ancient European evergreen with dark foliage',
        allowedTerrains: ['grass', 'dirt', 'coniferous_floor', 'deciduous_floor'],
    },
    dawn_redwood: {
        id: 'dawn_redwood',
        name: 'Dawn Redwood Tree',
        icon: '🌲',
        biome: 'coniferous_floor',
        cost: 140,
        tileSpace: 0.3,
        height: 'tall',
        description: 'Living fossil from the Cretaceous period',
        allowedTerrains: ['grass', 'dirt', 'coniferous_floor', 'rainforest_floor'],
    },
    yellow_cedar: {
        id: 'yellow_cedar',
        name: 'Yellow Cedar Tree',
        icon: '🌲',
        biome: 'coniferous_floor',
        cost: 145,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Aromatic cedar with drooping branches',
        allowedTerrains: ['grass', 'dirt', 'coniferous_floor'],
    },
    spruce_tree: {
        id: 'spruce_tree',
        name: 'Spruce Tree',
        icon: '🌲',
        biome: 'coniferous_floor',
        cost: 145,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Tall conifer with short stiff needles',
        allowedTerrains: ['grass', 'dirt', 'coniferous_floor', 'snow'],
    },
    lodgepole_pine: {
        id: 'lodgepole_pine',
        name: 'Lodgepole Pine Tree',
        icon: '🌲',
        biome: 'coniferous_floor',
        cost: 160,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Tall slender pine used by Native Americans for lodges',
        allowedTerrains: ['grass', 'dirt', 'coniferous_floor'],
    },
    western_red_cedar: {
        id: 'western_red_cedar',
        name: 'Western Red Cedar Tree',
        icon: '🌲',
        biome: 'coniferous_floor',
        cost: 165,
        tileSpace: 0.3,
        height: 'tall',
        description: 'Majestic cedar with scale-like foliage',
        allowedTerrains: ['grass', 'dirt', 'coniferous_floor'],
    },
    norfolk_island_pine: {
        id: 'norfolk_island_pine',
        name: 'Norfolk Island Pine Tree',
        icon: '🌲',
        biome: 'coniferous_floor',
        cost: 170,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Distinctive symmetrical pine from the Cretaceous',
        allowedTerrains: ['grass', 'dirt', 'coniferous_floor', 'sand'],
    },
    club_moss: {
        id: 'club_moss',
        name: 'Club Moss Shrub',
        icon: '🌿',
        biome: 'coniferous_floor',
        cost: 190,
        tileSpace: 0.2,
        height: 'low',
        description: 'Prehistoric ground cover from the Jurassic period',
        allowedTerrains: ['grass', 'dirt', 'coniferous_floor', 'rainforest_floor'],
    },
    walchian_conifer: {
        id: 'walchian_conifer',
        name: 'Walchian Conifer Tree',
        icon: '🌲',
        biome: 'coniferous_floor',
        cost: 200,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Ancient conifer from the Jurassic period',
        allowedTerrains: ['grass', 'dirt', 'coniferous_floor', 'rainforest_floor'],
    },
    lepidodendron: {
        id: 'lepidodendron',
        name: 'Lepidodendron Tree',
        icon: '🌴',
        biome: 'coniferous_floor',
        cost: 210,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Giant scale tree from the Carboniferous period',
        allowedTerrains: ['grass', 'dirt', 'coniferous_floor', 'rainforest_floor'],
    },

    // Rainforest biome
    rainforest_bush: {
        id: 'rainforest_bush',
        name: 'Rainforest Bush',
        icon: '🌿',
        biome: 'rainforest_floor',
        cost: 50,
        tileSpace: 0.2,
        height: 'low',
        description: 'Dense tropical bush found in African rainforests',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor'],
    },
    rainforest_fern: {
        id: 'rainforest_fern',
        name: 'Rainforest Fern',
        icon: '🌿',
        biome: 'rainforest_floor',
        cost: 45,
        tileSpace: 0.15,
        height: 'low',
        description: 'Lush tropical fern from Southeast Asia',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor'],
    },
    rainforest_stump: {
        id: 'rainforest_stump',
        name: 'Rainforest Stump',
        icon: '🪵',
        biome: 'rainforest_floor',
        cost: 35,
        tileSpace: 0.15,
        height: 'low',
        description: 'Moss-covered tree stump from South American rainforests',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor'],
    },
    rafflesia: {
        id: 'rafflesia',
        name: 'Rafflesia',
        icon: '🌺',
        biome: 'rainforest_floor',
        cost: 80,
        tileSpace: 0.25,
        height: 'low',
        description: 'Giant parasitic flower from Southeast Asian rainforests',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor'],
    },
    fern_bush: {
        id: 'fern_bush',
        name: 'Fern Bush',
        icon: '🌿',
        biome: 'rainforest_floor',
        cost: 100,
        tileSpace: 0.2,
        height: 'medium',
        description: 'Prehistoric fern from Jurassic North America',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor', 'coniferous_floor'],
    },
    giant_ficus_tree: {
        id: 'giant_ficus_tree',
        name: 'Giant Ficus Tree',
        icon: '🌳',
        biome: 'rainforest_floor',
        cost: 115,
        tileSpace: 0.4,
        height: 'tall',
        description: 'Massive strangler fig from Southeast Asian jungles',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor'],
    },
    foxtail_palm_tree: {
        id: 'foxtail_palm_tree',
        name: 'Foxtail Palm Tree',
        icon: '🌴',
        biome: 'rainforest_floor',
        cost: 120,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Elegant palm with bushy fronds from Southeast Asia',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor', 'sand'],
    },
    ulmo_tree: {
        id: 'ulmo_tree',
        name: 'Ulmo Tree',
        icon: '🌳',
        biome: 'rainforest_floor',
        cost: 120,
        tileSpace: 0.3,
        height: 'tall',
        description: 'Flowering tree native to South American temperate rainforests',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor'],
    },
    fallen_rainforest_tree: {
        id: 'fallen_rainforest_tree',
        name: 'Fallen Rainforest Tree',
        icon: '🪵',
        biome: 'rainforest_floor',
        cost: 120,
        tileSpace: 0.5,
        height: 'low',
        description: 'Fallen tree trunk covered in moss and fungi',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor'],
    },
    orchid_tree: {
        id: 'orchid_tree',
        name: 'Orchid Tree',
        icon: '🌸',
        biome: 'rainforest_floor',
        cost: 125,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Beautiful flowering tree from African rainforests',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor'],
    },
    durian_tree: {
        id: 'durian_tree',
        name: 'Durian Tree',
        icon: '🌳',
        biome: 'rainforest_floor',
        cost: 125,
        tileSpace: 0.3,
        height: 'tall',
        description: 'Famous fruit tree from Southeast Asian rainforests',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor'],
    },
    leptocycas_tree: {
        id: 'leptocycas_tree',
        name: 'Leptocycas Tree',
        icon: '🌴',
        biome: 'rainforest_floor',
        cost: 125,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Prehistoric cycad from Triassic South America',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor'],
    },
    thouarsus_cycad_tree: {
        id: 'thouarsus_cycad_tree',
        name: 'Thouarsus Cycad Tree',
        icon: '🌴',
        biome: 'rainforest_floor',
        cost: 140,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Ancient cycad from Triassic North America',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor'],
    },
    mangrove_tree: {
        id: 'mangrove_tree',
        name: 'Mangrove Tree',
        icon: '🌳',
        biome: 'rainforest_floor',
        cost: 155,
        tileSpace: 0.3,
        height: 'tall',
        description: 'Coastal tree with distinctive prop roots',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor', 'sand'],
    },
    llala_palm_tree: {
        id: 'llala_palm_tree',
        name: 'Llala Palm Tree',
        icon: '🌴',
        biome: 'rainforest_floor',
        cost: 175,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Tall palm native to South American rainforests',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor'],
    },
    elephant_ear_tree: {
        id: 'elephant_ear_tree',
        name: 'Elephant Ear Tree',
        icon: '🌳',
        biome: 'rainforest_floor',
        cost: 185,
        tileSpace: 0.35,
        height: 'tall',
        description: 'Tree with massive leaves from African rainforests',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor'],
    },
    williamsonia_tree: {
        id: 'williamsonia_tree',
        name: 'Williamsonia Tree',
        icon: '🌴',
        biome: 'rainforest_floor',
        cost: 200,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Prehistoric flowering plant from Jurassic China',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor'],
    },
    kapok_tree: {
        id: 'kapok_tree',
        name: 'Kapok Tree',
        icon: '🌳',
        biome: 'rainforest_floor',
        cost: 230,
        tileSpace: 0.5,
        height: 'tall',
        description: 'Massive emergent tree towering over the rainforest canopy',
        allowedTerrains: ['grass', 'dirt', 'rainforest_floor'],
    },

    // Highland biome (gray_stone)
    sage_bush: {
        id: 'sage_bush',
        name: 'Sage Bush',
        icon: '🌿',
        biome: 'gray_stone',
        cost: 65,
        tileSpace: 0.2,
        height: 'low',
        description: 'Aromatic shrub native to North American highlands',
        allowedTerrains: ['grass', 'dirt', 'gray_stone', 'brown_stone', 'gravel'],
    },
    himalayan_birch_tree: {
        id: 'himalayan_birch_tree',
        name: 'Himalayan Birch Tree',
        icon: '🌳',
        biome: 'gray_stone',
        cost: 125,
        tileSpace: 0.25,
        height: 'tall',
        description: 'White-barked birch from the high mountains of China',
        allowedTerrains: ['grass', 'dirt', 'gray_stone', 'brown_stone'],
    },
    western_larch_tree: {
        id: 'western_larch_tree',
        name: 'Western Larch Tree',
        icon: '🌲',
        biome: 'gray_stone',
        cost: 125,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Deciduous conifer from North American mountains',
        allowedTerrains: ['grass', 'dirt', 'gray_stone', 'coniferous_floor'],
    },
    paper_birch_tree: {
        id: 'paper_birch_tree',
        name: 'Paper Birch Tree',
        icon: '🌳',
        biome: 'gray_stone',
        cost: 125,
        tileSpace: 0.2,
        height: 'tall',
        description: 'White-barked tree with peeling papery bark',
        allowedTerrains: ['grass', 'dirt', 'gray_stone', 'deciduous_floor'],
    },
    western_juniper_tree: {
        id: 'western_juniper_tree',
        name: 'Western Juniper Tree',
        icon: '🌲',
        biome: 'gray_stone',
        cost: 125,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Gnarled evergreen from North American highlands',
        allowedTerrains: ['grass', 'dirt', 'gray_stone', 'brown_stone'],
    },
    himalayan_pine_tree: {
        id: 'himalayan_pine_tree',
        name: 'Himalayan Pine Tree',
        icon: '🌲',
        biome: 'gray_stone',
        cost: 180,
        tileSpace: 0.3,
        height: 'tall',
        description: 'Elegant pine from the high mountains of China',
        allowedTerrains: ['grass', 'dirt', 'gray_stone', 'coniferous_floor', 'snow'],
    },
    bamboo: {
        id: 'bamboo',
        name: 'Bamboo',
        icon: '🎋',
        biome: 'gray_stone',
        cost: 500,
        tileSpace: 0.15,
        height: 'tall',
        description: 'Tall grass beloved by pandas from Chinese highlands',
        allowedTerrains: ['grass', 'dirt', 'gray_stone', 'rainforest_floor'],
    },

    // Snow/Tundra biome
    snowy_grass: {
        id: 'snowy_grass',
        name: 'Snowy Grass',
        icon: '🌾',
        biome: 'snow',
        cost: 35,
        tileSpace: 0.2,
        height: 'low',
        description: 'Hardy grass poking through arctic snow',
        allowedTerrains: ['snow', 'grass', 'dirt', 'gray_stone'],
    },
    snowy_bush: {
        id: 'snowy_bush',
        name: 'Snowy Bush',
        icon: '❄️',
        biome: 'snow',
        cost: 75,
        tileSpace: 0.2,
        height: 'low',
        description: 'Snow-covered shrub from North American tundra',
        allowedTerrains: ['snow', 'grass', 'dirt', 'gray_stone'],
    },
    arctic_grass: {
        id: 'arctic_grass',
        name: 'Arctic Grass',
        icon: '🌾',
        biome: 'snow',
        cost: 100,
        tileSpace: 0.25,
        height: 'low',
        description: 'Tough tundra grass from Ice Age Europe',
        allowedTerrains: ['snow', 'grass', 'dirt', 'gray_stone'],
    },
    snowy_tree: {
        id: 'snowy_tree',
        name: 'Snowy Tree',
        icon: '🌲',
        biome: 'snow',
        cost: 110,
        tileSpace: 0.3,
        height: 'tall',
        description: 'Snow-laden conifer from North American tundra',
        allowedTerrains: ['snow', 'grass', 'dirt', 'coniferous_floor'],
    },
    arctic_bush: {
        id: 'arctic_bush',
        name: 'Arctic Bush',
        icon: '❄️',
        biome: 'snow',
        cost: 150,
        tileSpace: 0.25,
        height: 'medium',
        description: 'Dense shrub from Ice Age Eurasia',
        allowedTerrains: ['snow', 'grass', 'dirt', 'gray_stone'],
    },
    arctic_birch_tree: {
        id: 'arctic_birch_tree',
        name: 'Arctic Birch Tree',
        icon: '🌳',
        biome: 'snow',
        cost: 200,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Hardy birch adapted to extreme cold',
        allowedTerrains: ['snow', 'grass', 'dirt', 'gray_stone', 'coniferous_floor'],
    },

    // Desert biome (sand)
    sand_bush: {
        id: 'sand_bush',
        name: 'Sand Bush',
        icon: '🌿',
        biome: 'sand',
        cost: 60,
        tileSpace: 0.2,
        height: 'low',
        description: 'Hardy desert shrub from North Africa',
        allowedTerrains: ['sand', 'dirt', 'savanna_grass', 'brown_stone'],
    },
    agave_cactus: {
        id: 'agave_cactus',
        name: 'Agave Cactus',
        icon: '🌵',
        biome: 'sand',
        cost: 75,
        tileSpace: 0.2,
        height: 'medium',
        description: 'Succulent rosette plant from North American deserts',
        allowedTerrains: ['sand', 'dirt', 'savanna_grass', 'brown_stone'],
    },
    palm_tree: {
        id: 'palm_tree',
        name: 'Palm Tree',
        icon: '🌴',
        biome: 'sand',
        cost: 75,
        tileSpace: 0.2,
        height: 'tall',
        description: 'Classic desert oasis palm tree',
        allowedTerrains: ['sand', 'dirt', 'savanna_grass', 'grass'],
    },
    saguaro_cactus: {
        id: 'saguaro_cactus',
        name: 'Saguaro Cactus',
        icon: '🌵',
        biome: 'sand',
        cost: 80,
        tileSpace: 0.15,
        height: 'tall',
        description: 'Iconic tall cactus of the American Southwest',
        allowedTerrains: ['sand', 'dirt', 'brown_stone'],
    },
    yucca_tree: {
        id: 'yucca_tree',
        name: 'Yucca Tree',
        icon: '🌴',
        biome: 'sand',
        cost: 115,
        tileSpace: 0.2,
        height: 'medium',
        description: 'Spiky desert plant from North America',
        allowedTerrains: ['sand', 'dirt', 'savanna_grass', 'brown_stone'],
    },
    prickly_pear_cactus: {
        id: 'prickly_pear_cactus',
        name: 'Prickly Pear Cactus',
        icon: '🌵',
        biome: 'sand',
        cost: 125,
        tileSpace: 0.25,
        height: 'medium',
        description: 'Paddle-shaped cactus from African deserts',
        allowedTerrains: ['sand', 'dirt', 'savanna_grass', 'brown_stone'],
    },
    joshua_tree: {
        id: 'joshua_tree',
        name: 'Joshua Tree',
        icon: '🌴',
        biome: 'sand',
        cost: 125,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Distinctive spiky tree from Western USA',
        allowedTerrains: ['sand', 'dirt', 'brown_stone'],
    },
    doum_palm_tree: {
        id: 'doum_palm_tree',
        name: 'Doum Palm Tree',
        icon: '🌴',
        biome: 'sand',
        cost: 150,
        tileSpace: 0.25,
        height: 'tall',
        description: 'Branching palm tree from North African oases',
        allowedTerrains: ['sand', 'dirt', 'savanna_grass'],
    },
    quiver_tree: {
        id: 'quiver_tree',
        name: 'Quiver Tree',
        icon: '🌳',
        biome: 'sand',
        cost: 210,
        tileSpace: 0.3,
        height: 'tall',
        description: 'Distinctive aloe tree from African deserts',
        allowedTerrains: ['sand', 'dirt', 'brown_stone', 'gray_stone'],
    },
};

/**
 * Foliage class - decorative plants and vegetation
 */
export class Foliage {
    private _game: Game; // Stored for potential future use

    public readonly id: number;
    public tileX: number;
    public tileY: number;

    // Type data
    public readonly foliageType: FoliageType;
    public readonly name: string;
    public readonly biome: string;
    public readonly tileSpace: number;
    public readonly height: 'low' | 'medium' | 'tall';

    // Position offset within tile (for variety)
    public readonly offsetX: number;
    public readonly offsetY: number;

    // Visual variation
    public readonly scale: number;
    public readonly rotation: number;

    // Static ID counter
    private static nextId: number = 1;

    constructor(game: Game, tileX: number, tileY: number, foliageType: FoliageType) {
        this._game = game;
        this.id = Foliage.nextId++;
        this.tileX = tileX;
        this.tileY = tileY;

        // Get type data
        const typeData = FoliageTypes[foliageType];
        this.foliageType = foliageType;
        this.name = typeData.name;
        this.biome = typeData.biome;
        this.tileSpace = typeData.tileSpace;
        this.height = typeData.height;

        // Position offset within tile (for variety)
        this.offsetX = 0.2 + Math.random() * 0.6;
        this.offsetY = 0.2 + Math.random() * 0.6;

        // Visual variation
        this.scale = 0.9 + Math.random() * 0.2;
        this.rotation = Math.random() * 0.2 - 0.1;
    }

    /**
     * Get world position (tile + offset)
     */
    getWorldPos(): { x: number; y: number } {
        return {
            x: this.tileX + this.offsetX - 0.5,
            y: this.tileY + this.offsetY - 0.5,
        };
    }

    /**
     * Get depth value for rendering (isometric depth sorting)
     */
    getDepth(): number {
        return this.tileX + this.tileY + this.offsetY;
    }

    /**
     * Check if this foliage can be placed on a terrain type
     */
    static canPlaceOn(foliageType: FoliageType, terrain: TerrainType): boolean {
        const typeData = FoliageTypes[foliageType];
        return typeData.allowedTerrains.includes(terrain);
    }

    /**
     * Get the cost of a foliage type
     */
    static getCost(foliageType: FoliageType): number {
        return FoliageTypes[foliageType].cost;
    }

    /**
     * Get display icon
     */
    getIcon(): string {
        return FoliageTypes[this.foliageType].icon;
    }

    /**
     * Get the tile space used by a foliage type
     */
    static getTileSpace(foliageType: FoliageType): number {
        return FoliageTypes[foliageType].tileSpace;
    }

    /**
     * Check if there's enough space on a tile for this foliage
     */
    static hasSpaceOnTile(foliageType: FoliageType, currentUsage: number): boolean {
        const spaceNeeded = FoliageTypes[foliageType].tileSpace;
        return currentUsage + spaceNeeded <= 1.0;
    }
}
