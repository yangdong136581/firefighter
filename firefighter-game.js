// ==================== 消防员灭火游戏 - 统一三态粒子元胞自动机引擎 ====================
// 固体/液体/气体统一为每格一个粒子, 用 state+density 驱动移动/燃烧/热传导/相变

// ==================== 粒子态与材质定义 ====================
const STATE = { EMPTY: 0, SOLID: 1, LIQUID: 2, GAS: 3 };

const MAT = {
    EMPTY: 0,
    // 固体
    CONCRETE: 1, WOOD: 2, METAL: 3, WALL: 4, PAPER: 5, FUEL: 6, CHAR: 7,
    // 液体
    WATER: 8, FOAM: 9, OIL: 10,
    // 气体
    STEAM: 11, SMOKE: 12, FGAS: 13,
    // 灭火剂: CO2重气体(下沉隔氧), POWDER干粉(下落覆盖隔氧)
    CO2: 14, POWDER: 15,
    // 高温熔融金属: METAL达熔点2000°C熔化为铁水(流动+点燃可燃物), 冷却重新凝固
    MOLTEN: 16,
    // 门: 木质门(可斧头破拆开辟通道, 可燃)
    DOOR: 17,
    // 火药罐: 受热/被点燃即猛烈爆炸(范围破坏+引燃+震屏)
    KEG: 18,
    // 草: 森林植被(极易燃, 快速蔓延)
    GRASS: 19,
    // 岩浆: 火山喷发的高温流动液体(点燃可燃物, 冷却凝固为岩石)
    LAVA: 20,
    // 冰: 固体水(受热融化成水, 现场水源/防火屏障; 斧头可破)
    ICE: 21,
    // 玻璃: 透明窗户(硬度低, 斧头一击即碎, 破窗入屋)
    GLASS: 22,
    // 红砖: FC马里奥式亮红砖(平台/装饰, 与深棕砖墙WALL区分)
    BRICK: 23,
    // 汽油: 轻质燃油(密度720<水, 浮在水面燃烧; 水浇不灭(水沉底), 需泡沫/干粉)
    GASOLINE: 24,
    // 沥青: 重质粘稠燃油(密度1100>水, 沉入水底; 难点燃但燃烧持久温度高)
    TAR: 25,
    // 火药粉: 松散粉末(像沙下落), 极易燃且燃烧时高速引燃周围可燃物(连锁火道)
    GUNPOWDER: 26
};

// 统一属性: state(态), density(密度kg/m³), structural(固体静态不落), flammable, ignition(燃点),
//           fuel(燃料), specHeat(比热容J/kg·K), hardness(硬度), color, life(气体寿命s), coolant(冷却剂), suppress(灭火倍率),
//           meltingPoint(熔点°C, 达到熔化为液态), thermal(导热系数倍率, 金属高/木材低)
const MAT_PROPS = {
    [MAT.EMPTY]:    { state: STATE.EMPTY,  density: 1,    structural: false, flammable: false, ignition: 9999, fuel: 0,   specHeat: 1000, hardness: 0,  color: null,       life: 0,  coolant: false, meltingPoint: 9999, thermal: 1.0 },
    // 固体: structural=true 静态不掉落; false 无支撑下落(粉末)
    [MAT.CONCRETE]: { state: STATE.SOLID,  density: 2400, structural: true,  flammable: false, ignition: 9999, fuel: 0,   specHeat: 880,  hardness: 8,  color: '#4a4a5a', life: 0,  coolant: false, meltingPoint: 9999, thermal: 0.8 },
    [MAT.WOOD]:     { state: STATE.SOLID,  density: 700,  structural: true,  flammable: true,  ignition: 300,  fuel: 100, specHeat: 1700, hardness: 3,  color: '#8B6914', life: 0,  coolant: false, meltingPoint: 9999, thermal: 0.5 },
    [MAT.METAL]:    { state: STATE.SOLID,  density: 7800, structural: true,  flammable: false, ignition: 9999, fuel: 0,   specHeat: 500,  hardness: 12, color: '#6a6a7a', life: 0,  coolant: false, meltingPoint: 2000, thermal: 3.0 },
    [MAT.WALL]:     { state: STATE.SOLID,  density: 1800, structural: true,  flammable: false, ignition: 9999, fuel: 0,   specHeat: 880,  hardness: 6,  color: '#5c4033', life: 0,  coolant: false, meltingPoint: 9999, thermal: 0.8 },
    [MAT.PAPER]:    { state: STATE.SOLID,  density: 400,  structural: false, flammable: true,  ignition: 150,  fuel: 40,  specHeat: 1340, hardness: 1,  color: '#d4c5a0', life: 0,  coolant: false, meltingPoint: 9999, thermal: 0.5 },
    [MAT.FUEL]:     { state: STATE.SOLID,  density: 900,  structural: false, flammable: true,  ignition: 200,  fuel: 60,  specHeat: 2000, hardness: 2,  color: '#8b0000', life: 0,  coolant: false, meltingPoint: 9999, thermal: 0.6 },
    [MAT.CHAR]:     { state: STATE.SOLID,  density: 300,  structural: false, flammable: true,  ignition: 350,  fuel: 30,  specHeat: 700,  hardness: 1,  color: '#1a1008', life: 0,  coolant: false, meltingPoint: 9999, thermal: 0.4 },
    // 液体: coolant=可灭火吸热; 水比热容8372(真实值2倍)吸热最强
    [MAT.WATER]:    { state: STATE.LIQUID, density: 1000, structural: false, flammable: false, ignition: 9999, fuel: 0,   specHeat: 8372, hardness: 0,  color: '#1e90ff', life: 0,  coolant: true, suppress: 1, meltingPoint: 9999, thermal: 1.0 },
    [MAT.FOAM]:     { state: STATE.LIQUID, density: 100,  structural: false, flammable: false, ignition: 9999, fuel: 0,   specHeat: 4000, hardness: 0,  color: '#dcf0ff', life: 0,  coolant: true, suppress: 2, meltingPoint: 9999, thermal: 1.0 },
    [MAT.OIL]:      { state: STATE.LIQUID, density: 800,  structural: false, flammable: true,  ignition: 250,  fuel: 80,  specHeat: 2000, hardness: 0,  color: '#3a2a10', life: 0,  coolant: false, meltingPoint: 9999, thermal: 0.8 },
    // 气体: life=寿命(秒)归零消散; 密度低所以上浮
    [MAT.STEAM]:    { state: STATE.GAS,    density: 0.6,  structural: false, flammable: false, ignition: 9999, fuel: 0,   specHeat: 2000, hardness: 0,  color: '#cfe8f5', life: 6,  coolant: false, meltingPoint: 9999, thermal: 1.0 },
    [MAT.SMOKE]:    { state: STATE.GAS,    density: 1.1,  structural: false, flammable: false, ignition: 9999, fuel: 0,   specHeat: 1000, hardness: 0,  color: '#2d2d37', life: 8,  coolant: false, meltingPoint: 9999, thermal: 1.0 },
    [MAT.FGAS]:     { state: STATE.GAS,    density: 0.8,  structural: false, flammable: true,  ignition: 200,  fuel: 40,  specHeat: 1500, hardness: 0,  color: '#7a9a4a', life: 12, coolant: false, meltingPoint: 9999, thermal: 1.0 },
    // 灭火剂: CO2密度2.0比空气重->下沉覆盖燃料表面隔绝空气(非EMPTY->airContact↓->窒息)+轻度冷却
    [MAT.CO2]:      { state: STATE.GAS,    density: 2.0,  structural: false, flammable: false, ignition: 9999, fuel: 0,   specHeat: 1200, hardness: 0,  color: '#b8c8d8', life: 8,  coolant: true, suppress: 1.5, meltingPoint: 9999, thermal: 1.0 },
    // 干粉: 固体粉末(像沙子下落)覆盖燃料表面隔绝空气->窒息; life归零消散
    [MAT.POWDER]:   { state: STATE.SOLID,  density: 800,  structural: false, flammable: false, ignition: 9999, fuel: 0,   specHeat: 900,  hardness: 0,  color: '#e6e0d0', life: 10, coolant: true, suppress: 1.5, meltingPoint: 9999, thermal: 0.8 },
    // 铁水: METAL达熔点2000°C熔化而成的高温流动液体(导热快, 接触点燃可燃物), 冷却<1500°C凝固回METAL
    [MAT.MOLTEN]:   { state: STATE.LIQUID, density: 7000, structural: false, flammable: false, ignition: 9999, fuel: 0,   specHeat: 500,  hardness: 0,  color: '#ff5a00', life: 0,  coolant: false, meltingPoint: 9999, thermal: 2.5 },
    // 门: 木质门(可斧头破拆开辟通道, 可燃, 纹理渲染门板+门框)
    [MAT.DOOR]:    { state: STATE.SOLID,  density: 700,  structural: true,  flammable: true,  ignition: 320,  fuel: 55,  specHeat: 1700, hardness: 3,  color: '#7a5230', life: 0,  coolant: false, meltingPoint: 9999, thermal: 0.5 },
    // 火药罐: 极易燃(ignition120), 一旦着火立即爆炸(爆炸逻辑在updateFire检测, 非普通燃烧)
    [MAT.KEG]:     { state: STATE.SOLID,  density: 1200, structural: false, flammable: true,  ignition: 120,  fuel: 100, specHeat: 1500, hardness: 2,  color: '#3a3a3a', life: 0,  coolant: false, meltingPoint: 9999, thermal: 1.2 },
    // 草: 极易燃(ignition120低燃料), 森林地表植被, 火烧后变焦炭; structural=true(树叶/树冠附着在树上不掉落)
    [MAT.GRASS]:   { state: STATE.SOLID,  density: 300,  structural: true,  flammable: true,  ignition: 120,  fuel: 25,  specHeat: 1500, hardness: 1,  color: '#3a7a2a', life: 0,  coolant: false, meltingPoint: 9999, thermal: 0.5 },
    // 岩浆: 高温流动液体(~1200°C), 点燃接触的可燃物, 冷却<700°C凝固为岩石(CONCRETE)
    [MAT.LAVA]:    { state: STATE.LIQUID, density: 3000, structural: false, flammable: false, ignition: 9999, fuel: 0,   specHeat: 1000, hardness: 0,  color: '#ff4500', life: 0,  coolant: false, meltingPoint: 9999, thermal: 2.0 },
    // 冰: 固体水(受热>=45°C融化成水可用于灭火, 斧头可破; 相变逻辑见updateHeat)
    [MAT.ICE]:     { state: STATE.SOLID,  density: 920,  structural: true,  flammable: false, ignition: 9999, fuel: 0,   specHeat: 2100, hardness: 2,  color: '#9fd4ee', life: 0,  coolant: false, meltingPoint: 9999, thermal: 1.2 },
    // 玻璃: 透明窗户(硬度1极脆, 斧头一击即碎破窗入屋; 不燃)
    [MAT.GLASS]:   { state: STATE.SOLID,  density: 2500, structural: true,  flammable: false, ignition: 9999, fuel: 0,   specHeat: 840,  hardness: 1,  color: '#a8d8e8', life: 0,  coolant: false, meltingPoint: 9999, thermal: 0.8 },
    // 红砖: FC马里奥式亮红砖(平台/楼梯装饰, 物理性能同砖墙WALL)
    [MAT.BRICK]:   { state: STATE.SOLID,  density: 1800, structural: true,  flammable: false, ignition: 9999, fuel: 0,   specHeat: 880,  hardness: 6,  color: '#b23e28', life: 0,  coolant: false, meltingPoint: 9999, thermal: 0.8 },
    // 汽油: 轻质燃油液体(密度720<水1000 -> 浮在水面; 燃点80极低, 燃烧温度上限1200°C;
    // 水浇不灭: 水密度大沉到汽油下方无法覆盖, 需泡沫(密度100浮在汽油上)/干粉/CO2)
    [MAT.GASOLINE]:{ state: STATE.LIQUID, density: 720,  structural: false, flammable: true,  ignition: 80,  fuel: 90,  specHeat: 2200, hardness: 0,  color: '#d4a017', life: 0,  coolant: false, meltingPoint: 9999, thermal: 0.8, fireTemp: 1200 },
    // 沥青: 重质粘稠燃油液体(密度1100>水 -> 沉入水底; 燃点400难点燃, 但燃料多燃烧持久, 温度上限1100°C)
    [MAT.TAR]:     { state: STATE.LIQUID, density: 1100, structural: false, flammable: true,  ignition: 400, fuel: 150, specHeat: 3000, hardness: 0,  color: '#1a1208', life: 0,  coolant: false, meltingPoint: 9999, thermal: 0.6, fireTemp: 1100 },
    // 火药粉: 松散固体粉末(无支撑下落), 燃点60极易燃, 燃烧时高速连锁引燃周围可燃物
    [MAT.GUNPOWDER]:{ state: STATE.SOLID, density: 900,  structural: false, flammable: true,  ignition: 60,  fuel: 50,  specHeat: 1200, hardness: 1,  color: '#2a2420', life: 0,  coolant: false, meltingPoint: 9999, thermal: 0.5, fireTemp: 1000 },
};

// ==================== 快速属性查表(TypedArray, 避免热循环中对象属性查找开销) ====================
const MAT_STATE = new Uint8Array(28);
const MAT_DENSITY = new Float32Array(28);
const MAT_SPECHEAT = new Float32Array(28);
const MAT_IGNITION = new Float32Array(28);
const MAT_FUEL = new Float32Array(28);
const MAT_STRUCTURAL = new Uint8Array(28);
const MAT_FLAMMABLE = new Uint8Array(28);
const MAT_COOLANT = new Uint8Array(28);
const MAT_SUPPRESS = new Float32Array(28);
const MAT_LIFE = new Float32Array(28);
const MAT_HARDNESS = new Float32Array(28);
const MAT_MELTPOINT = new Float32Array(28);
const MAT_THERMAL = new Float32Array(28);
const MAT_FIRETEMP = new Float32Array(28); // 燃烧温度上限(汽油/沥青更高, 默认900)
for (const key in MAT_PROPS) {
    const m = +key, p = MAT_PROPS[m];
    MAT_STATE[m] = p.state;
    MAT_DENSITY[m] = p.density;
    MAT_SPECHEAT[m] = p.specHeat;
    MAT_IGNITION[m] = p.ignition;
    MAT_FUEL[m] = p.fuel;
    MAT_STRUCTURAL[m] = p.structural ? 1 : 0;
    MAT_FLAMMABLE[m] = p.flammable ? 1 : 0;
    MAT_COOLANT[m] = p.coolant ? 1 : 0;
    MAT_SUPPRESS[m] = p.suppress || 0;
    MAT_LIFE[m] = p.life;
    MAT_HARDNESS[m] = p.hardness;
    MAT_MELTPOINT[m] = p.meltingPoint;
    MAT_THERMAL[m] = p.thermal;
    MAT_FIRETEMP[m] = p.fireTemp || 900;
}

// ==================== 网格模拟引擎 ====================
class GridSimulation {
    constructor(worldW, worldH, cellSize = 5) {
        this.cellSize = cellSize;
        this.cols = Math.ceil(worldW / cellSize);
        this.rows = Math.ceil(worldH / cellSize);
        this.worldW = worldW;
        this.worldH = worldH;
        const n = this.cols * this.rows;

        // 网格数据(每格一个粒子, 统一三态)
        this.material = new Uint8Array(n);     // 粒子类型(MAT.*)
        this.temperature = new Float32Array(n).fill(20); // 粒子温度(固/液/气统一)
        this.fire = new Float32Array(n);       // 火焰强度 0-1
        this.fuel = new Float32Array(n);       // 剩余燃料
        this.life = new Float32Array(n);       // 气体剩余寿命(秒)
        this.cellHP = new Float32Array(n);     // 材质耐久(斧头用)
        this.updated = new Uint8Array(n);      // 本帧是否已更新
        // 氧气改为隐式: 邻接EMPTY格即有空气, 无需oxygen数组

        this.steamEvents = [];  // 蒸汽产生事件(供补生网格水雾用)
        this.smokeCells = 0;     // 上一帧烟雾格总数(生成上限保护性能)
        this.fireEvents = [];   // 火焰事件(供视觉粒子用)
        this.emberEvents = [];  // 飞火火星事件(带初速, 游戏侧物理飞行+落地点燃)
        this.destroyEvents = []; // 材质破坏事件(碎屑粒子)
        this.explosionEvents = []; // 爆炸事件(火药罐/岩浆, 供震屏+粒子用)
    }

    idx(x, y) { return y * this.cols + x; }
    inBounds(x, y) { return x >= 0 && x < this.cols && y >= 0 && y < this.rows; }

    // 将世界坐标转为网格坐标
    worldToGrid(wx, wy) {
        return { gx: Math.floor(wx / this.cellSize), gy: Math.floor(wy / this.cellSize) };
    }

    // 设置矩形区域的材质
    setRect(x, y, w, h, mat) {
        const gx0 = Math.floor(x / this.cellSize);
        const gy0 = Math.floor(y / this.cellSize);
        const gx1 = Math.ceil((x + w) / this.cellSize);
        const gy1 = Math.ceil((y + h) / this.cellSize);
        for (let gy = gy0; gy < gy1 && gy < this.rows; gy++) {
            for (let gx = gx0; gx < gx1 && gx < this.cols; gx++) {
                if (gx < 0 || gy < 0) continue;
                const i = this.idx(gx, gy);
                this.material[i] = mat;
                this.fuel[i] = MAT_PROPS[mat].fuel;
                this.life[i] = MAT_PROPS[mat].life;
                this.cellHP[i] = MAT_PROPS[mat].hardness;
                // 高温材质初始高温(岩浆1200°C/铁水2000°C, 靠热传导点燃周围可燃物)
                if (mat === MAT.LAVA) this.temperature[i] = 1200;
                else if (mat === MAT.MOLTEN) this.temperature[i] = 2000;
            }
        }
    }

    // 在网格区域点火
    igniteRect(x, y, w, h) {
        const gx0 = Math.floor(x / this.cellSize);
        const gy0 = Math.floor(y / this.cellSize);
        const gx1 = Math.ceil((x + w) / this.cellSize);
        const gy1 = Math.ceil((y + h) / this.cellSize);
        for (let gy = gy0; gy < gy1 && gy < this.rows; gy++) {
            for (let gx = gx0; gx < gx1 && gx < this.cols; gx++) {
                if (gx < 0 || gy < 0) continue;
                const i = this.idx(gx, gy);
                if (MAT_PROPS[this.material[i]].flammable) {
                    this.fire[i] = 0.3 + Math.random() * 0.2; // 随机初始火强
                    this.fuel[i] = MAT_PROPS[this.material[i]].fuel; // 必须设置燃料, 否则火立即熄灭
                    this.temperature[i] = 380 + Math.random() * 60;
                }
            }
        }
    }

    // 在网格放置灭火剂粒子(离散单粒子模型: 每格一个; type 0=水 1=泡沫 2=干粉)
    addWater(wx, wy, amount, type = 0, temp = 20) {
        const { gx, gy } = this.worldToGrid(wx, wy);
        if (!this.inBounds(gx, gy)) return false;
        const i = this.idx(gx, gy);
        const m = this.material[i];
        if (m !== MAT.EMPTY) {
            // 烟雾/蒸汽等气体格: 灭火剂密度远大于气体, 可穿入并把气体挤开(修复:
            // 原只允许空格, 火场烟雾(不消散)占据格子后喷水完全无法出水);
            // 固体/液体仍阻挡放置
            if (MAT_STATE[m] !== STATE.GAS) return false;
            this.displaceGas(gx, gy, i);
        }
        this.material[i] = (type === 1) ? MAT.FOAM : (type === 2) ? MAT.POWDER : MAT.WATER;
        this.temperature[i] = temp;
        // 干粉有寿命(到时消散), 水/泡沫无寿命
        this.life[i] = (type === 2) ? MAT_LIFE[MAT.POWDER] : 0;
        this.cellHP[i] = 0;
        return true;
    }

    // 挤开气体: 灭火剂液滴进入烟雾/蒸汽格时, 把原气体挪到相邻空格(优先上方, 烟气本就上浮),
    // 四周无空格才被水流挤散(极少量); 尽量保留"烟雾不消散"特性而非直接抹除
    displaceGas(gx, gy, i) {
        const gasM = this.material[i];
        const gasT = this.temperature[i];
        const gasLife = this.life[i];
        const cols = this.cols, rows = this.rows;
        // 6方向优先序: 上/左上/右上/左/右/下(直接索引, 零分配)
        const offsets = [-cols, -cols - 1, -cols + 1, -1, 1, cols];
        const bx = [gx, gx - 1, gx + 1, gx - 1, gx + 1, gx];
        const by = [gy - 1, gy - 1, gy - 1, gy, gy, gy + 1];
        for (let d = 0; d < 6; d++) {
            const nx = bx[d], ny = by[d];
            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
            const ni = i + offsets[d];
            if (this.material[ni] === MAT.EMPTY) {
                this.material[ni] = gasM;
                this.temperature[ni] = gasT;
                this.life[ni] = gasLife;
                return;
            }
        }
    }

    // 在网格放置岩浆粒子(火山口涌出用): 初始1200°C
    // 若喷发点已被岩浆淹没, 沿同列向上找岩浆液面首个空格(上涌, 液面抬升直至溢出火山口);
    // 穿过LAVA与气体(蒸汽/烟), 遇到水(水封压制)或固体(凝固岩壳)则停止涌出
    addLavaCell(wx, wy) {
        const { gx, gy } = this.worldToGrid(wx, wy);
        if (!this.inBounds(gx, gy)) return false;
        let target = -1;
        const i = this.idx(gx, gy);
        if (this.material[i] === MAT.EMPTY) {
            target = i;
        } else if (this.material[i] === MAT.LAVA) {
            for (let sy = gy - 1; sy >= Math.max(0, gy - 60); sy--) {
                const si = this.idx(gx, sy);
                const sm = this.material[si];
                if (sm === MAT.EMPTY) { target = si; break; }
                if (sm === MAT.LAVA || MAT_STATE[sm] === STATE.GAS) continue;
                break; // 水/固体: 被压制, 停止上涌
            }
        }
        if (target < 0) return false;
        this.material[target] = MAT.LAVA;
        this.temperature[target] = 1200;
        this.life[target] = 0;
        this.cellHP[target] = 0;
        return true;
    }

    // 统计某世界矩形区域内岩浆格数(供火山口堵住判定: 为0=岩浆全部冷却凝固)
    countLavaInRegion(x, y, w, h) {
        const gx0 = Math.floor(x / this.cellSize);
        const gy0 = Math.floor(y / this.cellSize);
        const gx1 = Math.ceil((x + w) / this.cellSize);
        const gy1 = Math.ceil((y + h) / this.cellSize);
        let n = 0;
        for (let gy = Math.max(0, gy0); gy < gy1 && gy < this.rows; gy++) {
            for (let gx = Math.max(0, gx0); gx < gx1 && gx < this.cols; gx++) {
                if (this.material[this.idx(gx, gy)] === MAT.LAVA) n++;
            }
        }
        return n;
    }

    // 预热区域内固体格子到指定温度(火山口岩石被岩浆烤热, 不再快速抽取岩浆热量)
    preheatSolids(x, y, w, h, temp) {
        const gx0 = Math.floor(x / this.cellSize);
        const gy0 = Math.floor(y / this.cellSize);
        const gx1 = Math.ceil((x + w) / this.cellSize);
        const gy1 = Math.ceil((y + h) / this.cellSize);
        for (let gy = Math.max(0, gy0); gy < gy1 && gy < this.rows; gy++) {
            for (let gx = Math.max(0, gx0); gx < gx1 && gx < this.cols; gx++) {
                const i = this.idx(gx, gy);
                if (MAT_STATE[this.material[i]] === STATE.SOLID) this.temperature[i] = Math.max(this.temperature[i], temp);
            }
        }
    }

    // 给区域内岩浆持续供热(地热): 岩浆温度不低于temp, 环境冷却无法使其凝固,
    // 只有浇水的强冷却(在供热间隙内压到700°C以下)才能使其凝固为岩石
    reheatLava(x, y, w, h, temp) {
        const gx0 = Math.floor(x / this.cellSize);
        const gy0 = Math.floor(y / this.cellSize);
        const gx1 = Math.ceil((x + w) / this.cellSize);
        const gy1 = Math.ceil((y + h) / this.cellSize);
        for (let gy = Math.max(0, gy0); gy < gy1 && gy < this.rows; gy++) {
            for (let gx = Math.max(0, gx0); gx < gx1 && gx < this.cols; gx++) {
                const i = this.idx(gx, gy);
                if (this.material[i] === MAT.LAVA && this.temperature[i] < temp) this.temperature[i] = temp;
            }
        }
    }

    // 喷射水(带方向扩散)
    sprayWater(wx, wy, angle, speed, spread, count, type = 0) {
        for (let i = 0; i < count; i++) {
            const a = angle + (Math.random() - 0.5) * spread;
            const dist = Math.random() * speed * 0.06;
            const px = wx + Math.cos(a) * dist;
            const py = wy + Math.sin(a) * dist;
            this.addWater(px, py, 0.3 + Math.random() * 0.3, type);
        }
    }

    // 爆炸: 半径内破坏结构+引燃可燃物(可连锁引爆火药罐)+产生高温火球
    explode(gx, gy, radius, power) {
        const r2 = radius * radius;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = gx + dx, ny = gy + dy;
                if (!this.inBounds(nx, ny)) continue;
                if (dx * dx + dy * dy > r2) continue;
                const ni = this.idx(nx, ny);
                const m = this.material[ni];
                if (m === MAT.EMPTY) {
                    this.temperature[ni] = Math.max(this.temperature[ni], 600); // 火球加热空气
                    continue;
                }
                if (MAT_FLAMMABLE[m]) {
                    // 可燃物直接点燃(火药罐连锁爆炸)
                    this.fire[ni] = Math.max(this.fire[ni], 0.8);
                    this.fuel[ni] = Math.max(this.fuel[ni], MAT_FUEL[m]);
                    this.temperature[ni] = Math.max(this.temperature[ni], 500);
                } else if (MAT_STATE[m] === STATE.SOLID && m !== MAT.METAL && m !== MAT.CONCRETE && m !== MAT.WALL) {
                    // 一般固体被冲击波摧毁(金属/混凝土/砖墙仅受热不毁)
                    this.destroyEvents.push({ x: nx * this.cellSize, y: ny * this.cellSize, mat: m });
                    this.material[ni] = MAT.EMPTY;
                    this.fire[ni] = 0; this.fuel[ni] = 0;
                } else {
                    this.temperature[ni] = Math.min(2500, this.temperature[ni] + power * 200);
                }
            }
        }
        this.explosionEvents.push({ x: gx * this.cellSize + this.cellSize / 2, y: gy * this.cellSize + this.cellSize / 2, radius, power });
    }

    // ==================== 主更新循环(两阶段: 移动相 + 反应相) ====================
    // (性能优化: 内联idx/跳过结构件/合并统计循环, 减少函数调用+消除额外全网格扫描)
    update(dt) {
        this.steamEvents = [];
        this.fireEvents = [];
        this.emberEvents = [];
        this.destroyEvents = [];
        this.explosionEvents = [];

        const cols = this.cols, rows = this.rows;
        const mat = this.material, upd = this.updated;

        // === 阶段1: 移动(固体下落/液体流动/气体上升) ===
        // 优化: 跳过EMPTY和结构件(占网格大多数), 避免moveParticle函数调用开销
        upd.fill(0);
        for (let y = rows - 2; y >= 0; y--) {
            const leftToRight = Math.random() > 0.5;
            const rowOff = y * cols;
            for (let k = 0; k < cols; k++) {
                const x = leftToRight ? k : (cols - 1 - k);
                const i = rowOff + x;
                if (upd[i]) continue;
                const m = mat[i];
                if (m === MAT.EMPTY) continue;
                const st = MAT_STATE[m];
                if (st === STATE.SOLID) {
                    if (!MAT_STRUCTURAL[m]) this.moveSolid(x, y, i); // 仅粉末下落
                } else if (st === STATE.LIQUID) {
                    this.moveLiquid(x, y, i);
                } else if (st === STATE.GAS) {
                    this.moveGas(x, y, i, dt);
                }
            }
        }

        // === 阶段2: 反应(燃烧/自燃/热扩散/相变) + 统计(合并, 省去额外全网格扫描) ===
        let activeFire = 0, smokeCells = 0;
        for (let y = 0; y < rows; y++) {
            const rowOff = y * cols;
            for (let x = 0; x < cols; x++) {
                const i = rowOff + x;
                const m = mat[i];
                if (m === MAT.EMPTY) {
                    // 空气冷却: 被火焰加热的热空气自然向环境温度消散(不会无限累积)
                    if (this.temperature[i] > 25) {
                        this.temperature[i] = Math.max(20, this.temperature[i] - 40 * dt);
                        // 热空气对流导热: 热空气向上/向周围扩散(形成热羽流)并加热相邻物体
                        this.updateHeat(x, y, i, dt);
                    }
                    continue;
                }

                // 统计(合并入主循环, 不再单独遍历)
                if (this.fire[i] > 0.05) activeFire++;
                if (m === MAT.SMOKE) smokeCells++;

                // 干粉寿命衰减: 覆盖灭火后一段时间自动消散为空气(不永久堆积)
                if (m === MAT.POWDER) {
                    this.life[i] -= dt;
                    if (this.life[i] <= 0) {
                        mat[i] = MAT.EMPTY;
                        this.temperature[i] = 20;
                        this.fire[i] = 0; this.fuel[i] = 0; this.life[i] = 0;
                        continue;
                    }
                }

                // 火焰模拟(任意可燃态)
                if (this.fire[i] > 0.01) {
                    this.updateFire(x, y, i, dt);
                }

                // 自燃: 可燃物加热到燃点 + 有空气接触 -> 概率点燃
                if (this.fire[i] < 0.01 && MAT_FLAMMABLE[m] && this.temperature[i] >= MAT_IGNITION[m] && this.airContact(x, y) > 0) {
                    const overheat = this.temperature[i] / MAT_IGNITION[m] - 1;
                    if (Math.random() < Math.min(0.8, 0.15 + overheat * 2) * dt * 10) {
                        this.fire[i] = 0.15 + Math.random() * 0.15;
                        // 仅未燃烧过的新材质才补满燃料; 已部分燃烧的保留剩余燃料, 防止复燃重置导致无限燃料(1%灭不掉根因)
                        if (this.fuel[i] <= 0) this.fuel[i] = MAT_FUEL[m];
                    }
                }

                // 热扩散+相变: 仅热活跃格子(燃烧/高温/气体)需要计算
                // 冷格子由相邻热格子的扩散加热, 跳过避免全网格无效计算(性能关键)
                if (this.fire[i] > 0.01 || this.temperature[i] > 25 || MAT_STATE[m] === STATE.GAS) {
                    this.updateHeat(x, y, i, dt);
                }
            }
        }
        this.smokeCells = smokeCells;
        return activeFire;
    }

    // 交换两格全部粒子属性(并标记已更新)
    swapCells(i, j) {
        let t;
        t = this.material[i]; this.material[i] = this.material[j]; this.material[j] = t;
        t = this.temperature[i]; this.temperature[i] = this.temperature[j]; this.temperature[j] = t;
        t = this.fire[i]; this.fire[i] = this.fire[j]; this.fire[j] = t;
        t = this.fuel[i]; this.fuel[i] = this.fuel[j]; this.fuel[j] = t;
        t = this.life[i]; this.life[i] = this.life[j]; this.life[j] = t;
        t = this.cellHP[i]; this.cellHP[i] = this.cellHP[j]; this.cellHP[j] = t;
        this.updated[i] = 1;
        this.updated[j] = 1;
    }

    // 下沉判定: 目标为空, 或目标是密度更低的流体(固/液沉入气/低密度液)
    canSink(moverM, targetM) {
        if (targetM === MAT.EMPTY) return true;
        const ts = MAT_STATE[targetM];
        if (ts === STATE.SOLID) return false;
        return MAT_DENSITY[moverM] > MAT_DENSITY[targetM];
    }

    // 上浮判定: 目标为空, 或目标是液体(气泡穿过), 或目标是密度更高的气体
    canRise(gasM, targetM) {
        if (targetM === MAT.EMPTY) return true;
        const ts = MAT_STATE[targetM];
        if (ts === STATE.LIQUID) return true;
        if (ts === STATE.GAS) return MAT_DENSITY[gasM] < MAT_DENSITY[targetM];
        return false;
    }

    // 固体粉末下落(无支撑时)
    // (性能优化: idx内联为偏移量运算, 消除函数调用)
    moveSolid(x, y, i) {
        const cols = this.cols;
        if (y + 1 >= this.rows) return;
        const m = this.material[i];
        const below = i + cols;
        if (this.canSink(m, this.material[below])) { this.swapCells(i, below); return; }
        const dx = Math.random() > 0.5 ? 1 : -1;
        for (let t = 0; t < 2; t++) {
            const d = t === 0 ? dx : -dx;
            const nx = x + d;
            if (nx < 0 || nx >= cols) continue;
            const side = i + d;
            if (MAT_STATE[this.material[side]] === STATE.SOLID) continue; // 侧边被挡
            const diag = i + cols + d;
            if (this.canSink(m, this.material[diag])) { this.swapCells(i, diag); return; }
        }
    }

    // 液体流动: 下 -> 对角下 -> 水平扩散
    // (性能优化: idx内联为偏移量运算)
    moveLiquid(x, y, i) {
        const cols = this.cols;
        const m = this.material[i];
        if (y + 1 < this.rows) {
            const below = i + cols;
            if (this.canSink(m, this.material[below])) { this.swapCells(i, below); return; }
            const dx = Math.random() > 0.5 ? 1 : -1;
            for (let t = 0; t < 2; t++) {
                const d = t === 0 ? dx : -dx;
                const nx = x + d;
                if (nx < 0 || nx >= cols) continue;
                const diag = i + cols + d;
                if (this.canSink(m, this.material[diag])) { this.swapCells(i, diag); return; }
            }
        }
        // 水平扩散(向空格或更低密度流体)
        const dx2 = Math.random() > 0.5 ? 1 : -1;
        for (let t = 0; t < 2; t++) {
            const d = t === 0 ? dx2 : -dx2;
            const nx = x + d;
            if (nx < 0 || nx >= cols) continue;
            const side = i + d;
            const sm = this.material[side];
            if (sm === MAT.EMPTY || (MAT_STATE[sm] !== STATE.SOLID && MAT_DENSITY[m] > MAT_DENSITY[sm])) {
                this.swapCells(i, side); return;
            }
        }
    }

    // 气体移动: 寿命衰减 -> 轻气体上浮/重气体下沉(CO2密度>1.5下沉覆盖燃料隔氧)
    // (性能优化: idx内联为ci±cols/±d偏移, 消除数组分配)
    moveGas(x, y, i, dt) {
        const cols = this.cols;
        // 烟雾不消散(用户需求): 寿命不衰减, 在封闭空间永久积聚;
        // 仅到达地图顶部(露天)时散逸, 防止无限累积
        if (this.material[i] === MAT.SMOKE) {
            if (y <= 1) { this.dissipate(i); return; }
        } else {
            this.life[i] -= dt;
            if (this.life[i] <= 0) { this.dissipate(i); return; }
        }
        // 重气体(density>1.5, 如CO2=2.0): 下沉而非上浮(下->对角下->水平)
        if (MAT_DENSITY[this.material[i]] > 1.5) {
            this.moveHeavyGas(x, y, i);
            return;
        }
        let cx = x, cy = y, ci = i;
        // 下方是液体 -> 气泡加速上浮(最多2格), 否则1格
        let maxRise = 1;
        if (cy + 1 < this.rows && MAT_STATE[this.material[ci + cols]] === STATE.LIQUID) maxRise = 2;
        for (let step = 0; step < maxRise; step++) {
            if (cy - 1 < 0) break;
            const gm = this.material[ci];
            const up = ci - cols;
            if (this.canRise(gm, this.material[up])) { this.swapCells(ci, up); cy -= 1; ci = up; continue; }
            // 对角上
            const dx = Math.random() > 0.5 ? 1 : -1;
            let moved = false;
            for (let t = 0; t < 2; t++) {
                const d = t === 0 ? dx : -dx;
                const nx = cx + d;
                if (nx < 0 || nx >= cols) continue;
                const diag = ci - cols + d;
                if (this.canRise(gm, this.material[diag])) { this.swapCells(ci, diag); cx = nx; cy -= 1; ci = diag; moved = true; break; }
            }
            if (moved) continue;
            // 水平飘散(仅入空格)
            for (let t = 0; t < 2; t++) {
                const d = t === 0 ? dx : -dx;
                const nx = cx + d;
                if (nx < 0 || nx >= cols) continue;
                const side = ci + d;
                if (this.material[side] === MAT.EMPTY) { this.swapCells(ci, side); cx = nx; ci = side; break; }
            }
            break;
        }
    }

    // 重气体下沉(CO2等, density>1.5): 下 -> 对角下 -> 水平飘散(覆盖燃料表面隔绝空气)
    // (性能优化: idx内联为偏移量)
    moveHeavyGas(x, y, i) {
        const cols = this.cols;
        let cx = x, cy = y, ci = i;
        const gm = this.material[ci];
        // 下沉(入空格或更低密度气体)
        if (cy + 1 < this.rows) {
            const below = ci + cols;
            if (this.canSink(gm, this.material[below])) { this.swapCells(ci, below); return; }
            // 对角下
            const dx = Math.random() > 0.5 ? 1 : -1;
            for (let t = 0; t < 2; t++) {
                const d = t === 0 ? dx : -dx;
                const nx = cx + d;
                if (nx < 0 || nx >= cols) continue;
                const diag = ci + cols + d;
                if (this.canSink(gm, this.material[diag])) { this.swapCells(ci, diag); return; }
            }
        }
        // 水平飘散(仅入空格)
        const dx2 = Math.random() > 0.5 ? 1 : -1;
        for (let t = 0; t < 2; t++) {
            const d = t === 0 ? dx2 : -dx2;
            const nx = cx + d;
            if (nx < 0 || nx >= cols) continue;
            const side = ci + d;
            if (this.material[side] === MAT.EMPTY) { this.swapCells(ci, side); return; }
        }
    }

    // 在像素坐标处的空格生成气体粒子(烟雾/蒸汽; 供燃烧/爆炸/汽化事件补充气体)
    spawnGas(px, py, mat) {
        const gx = Math.floor(px / this.cellSize), gy = Math.floor(py / this.cellSize);
        if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) return false;
        const i = this.idx(gx, gy);
        if (this.material[i] !== MAT.EMPTY) return false;
        this.material[i] = mat;
        this.life[i] = MAT_LIFE[mat];
        this.fire[i] = 0; this.fuel[i] = 0;
        this.temperature[i] = Math.max(this.temperature[i], mat === MAT.STEAM ? 105 : 120);
        return true;
    }

    // 气体寿命耗尽: 蒸汽冷却可凝结回水, 其余消散为空气
    dissipate(i) {
        if (this.material[i] === MAT.STEAM && this.temperature[i] < 100 && Math.random() < 0.5) {
            this.material[i] = MAT.WATER;
            this.temperature[i] = Math.min(this.temperature[i], 90);
        } else {
            this.material[i] = MAT.EMPTY;
            this.temperature[i] = 20;
        }
        this.fire[i] = 0; this.fuel[i] = 0; this.life[i] = 0;
    }

    // 空气接触面: 相邻EMPTY格数(边界算空气); 固/液/气邻居都隔绝空气
    // (性能优化: 直接索引运算, 避免每帧数千次数组分配导致GC卡顿)
    airContact(x, y) {
        let c = 0;
        const cols = this.cols, rows = this.rows;
        if (x <= 0 || this.material[y * cols + x - 1] === MAT.EMPTY) c++;
        if (x >= cols - 1 || this.material[y * cols + x + 1] === MAT.EMPTY) c++;
        if (y <= 0 || this.material[(y - 1) * cols + x] === MAT.EMPTY) c++;
        if (y >= rows - 1 || this.material[(y + 1) * cols + x] === MAT.EMPTY) c++;
        return c;
    }

    // ==================== 统一热传导 + 相变 ====================
    // (性能优化: 4邻域直接索引运算, 消除每次数组分配; 内联inBounds判定)
    updateHeat(x, y, i, dt) {
        const m = this.material[i];
        const temp = this.temperature[i];
        const cols = this.cols, rows = this.rows;

        // 邻域热扩散(高温->低温, 双方比热容越大温度变化越慢)
        // 系数0.2: 冷格子已跳过自身扩散、仅由热格子单向传热, 等效于原先双向各0.1的净速率
        let selfDelta = 0;
        // 4邻域: 左/右/上/下 直接索引(避免数组分配+函数调用)
        const hasL = x > 0, hasR = x < cols - 1, hasU = y > 0, hasD = y < rows - 1;
        const niL = i - 1, niR = i + 1, niU = i - cols, niD = i + cols;
        for (let d = 0; d < 4; d++) {
            let ni, nm;
            if (d === 0) { if (!hasL) continue; ni = niL; }
            else if (d === 1) { if (!hasR) continue; ni = niR; }
            else if (d === 2) { if (!hasU) continue; ni = niU; }
            else { if (!hasD) continue; ni = niD; }
            nm = this.material[ni];
            const diff = temp - this.temperature[ni];
            if (Math.abs(diff) > 5) {
                // 空气↔空气: 低系数扩散(热空气逐格向上传热形成热羽流; 系数低+空气快速冷却防止失控)
                // 水吸热速率再翻倍(平衡调整): 热量流入水时使用4倍导热系数(0.4->0.8)
                // 岩浆↔空气: 极低系数(岩浆表面散热慢, 火山岩浆池不会自行快速凝固, 维持持续威胁; 浇水仍用intoWater强冷却)
                const airToAir = (nm === MAT.EMPTY && m === MAT.EMPTY);
                const intoWater = (nm === MAT.WATER && diff > 0) || (m === MAT.WATER && diff < 0);
                const lavaToAir = (m === MAT.LAVA && nm === MAT.EMPTY) || (nm === MAT.LAVA && m === MAT.EMPTY);
                const baseCoeff = intoWater ? 0.8 : (lavaToAir ? 0.03 : (airToAir ? 0.3 : 0.2));
                // 导热系数: 金属是优良导热体(两侧导热系数几何平均决定导热速率),
                // 钢结构快速把热量传到另一侧(内部钢架导热可引燃背面可燃物)
                const thermalFactor = Math.sqrt(MAT_THERMAL[m] * MAT_THERMAL[nm]);
                const transfer = diff * baseCoeff * thermalFactor * dt;
                this.temperature[ni] += transfer / MAT_SPECHEAT[nm] * 1000;
                selfDelta -= transfer / MAT_SPECHEAT[m] * 1000;
                // 嘶嘶水雾: 水接触高温物体(温差>150°C)立即产生蒸汽事件(不等水烧到100°C才可见;
                // 事件数限幅防止大面积接触时雾爆炸)
                if (intoWater && diff > 150 && this.steamEvents.length < 100 && Math.random() < 0.1) {
                    const wx = (nm === MAT.WATER) ? (ni % cols) : x, wy = (nm === MAT.WATER) ? ((ni / cols) | 0) : y;
                    this.steamEvents.push({ x: wx * this.cellSize + Math.random() * this.cellSize, y: wy * this.cellSize, temp: this.temperature[i], amount: 0.2 });
                }
            }
        }
        this.temperature[i] += selfDelta;

        // 相变: 水>=100 -> 蒸汽
        if (m === MAT.WATER && this.temperature[i] >= 100) {
            this.material[i] = MAT.STEAM;
            this.life[i] = MAT_LIFE[MAT.STEAM];
            this.fire[i] = 0; this.fuel[i] = 0;
            if (Math.random() < 0.4) this.steamEvents.push({ x: x * this.cellSize + Math.random() * this.cellSize, y: y * this.cellSize, temp: this.temperature[i], amount: 0.3 });
            return;
        }
        // 相变: 蒸汽冷却<95 -> 概率凝结回水
        if (m === MAT.STEAM && this.temperature[i] < 95 && Math.random() < 0.02) {
            this.material[i] = MAT.WATER;
            this.life[i] = 0;
            this.temperature[i] = Math.min(this.temperature[i], 90);
            return;
        }
        // 相变: 冰受热>=45°C -> 融化成水(现场水源; 火烤/岩浆烘烤/热空气都会融化)
        if (m === MAT.ICE && this.temperature[i] >= 45) {
            this.material[i] = MAT.WATER;
            this.cellHP[i] = 0;
            this.temperature[i] = Math.min(this.temperature[i], 80);
            return;
        }
        // 相变: 金属达熔点(2000°C) -> 铁水(高温流动液体, 导热快/接触点燃可燃物)
        if (m === MAT.METAL && this.temperature[i] >= MAT_MELTPOINT[MAT.METAL]) {
            this.material[i] = MAT.MOLTEN;
            this.cellHP[i] = MAT_HARDNESS[MAT.MOLTEN];
            if (Math.random() < 0.5) this.steamEvents.push({ x: x * this.cellSize + Math.random() * this.cellSize, y: y * this.cellSize, temp: this.temperature[i], amount: 0.3 });
            return;
        }
        // 相变: 铁水冷却<1500°C -> 重新凝固为金属
        if (m === MAT.MOLTEN && this.temperature[i] < 1500) {
            this.material[i] = MAT.METAL;
            this.cellHP[i] = MAT_HARDNESS[MAT.METAL];
            return;
        }
        // 相变: 岩浆冷却<700°C -> 凝固为岩石(混凝土)
        if (m === MAT.LAVA && this.temperature[i] < 700) {
            this.material[i] = MAT.CONCRETE;
            this.cellHP[i] = MAT_HARDNESS[MAT.CONCRETE];
            return;
        }

        // 自然冷却(向环境20度回归; 气体冷却最快; 岩浆有地热持续供热, 自然冷却极慢, 必须浇水才能凝固)
        if (this.temperature[i] > 20) {
            const st = MAT_STATE[m];
            const coolRate = m === MAT.LAVA ? 3 : (st === STATE.GAS ? 25 : (st === STATE.SOLID ? 8 : 12));
            this.temperature[i] = Math.max(20, this.temperature[i] - coolRate * dt);
        }
    }

    // ==================== 射线检测(水流/斧头隔墙遮挡用) ====================
    // 从(x0,y0)沿方向(dirX,dirY)返回到第一个固体的距离(未命中返回maxDist)
    solidRaycast(x0, y0, dirX, dirY, maxDist) {
        const cs = this.cellSize;
        const step = cs * 0.5;
        for (let d = step; d <= maxDist; d += step) {
            const gx = Math.floor((x0 + dirX * d) / cs);
            const gy = Math.floor((y0 + dirY * d) / cs);
            if (!this.inBounds(gx, gy)) return d; // 出界视为遮挡
            if (MAT_STATE[this.material[this.idx(gx, gy)]] === STATE.SOLID) return d;
        }
        return maxDist;
    }

    // 视线检查: 两点之间是否有固体阻挡(目标是否藏在墙后)
    isOccluded(x0, y0, x1, y1) {
        const dx = x1 - x0, dy = y1 - y0;
        const dist = Math.hypot(dx, dy);
        if (dist < 1) return false;
        const dirX = dx / dist, dirY = dy / dist;
        const cs = this.cellSize;
        const step = cs * 0.5;
        const maxD = dist - cs * 0.5; // 在目标前半格处停止, 避免误判目标本身
        for (let d = step; d < maxD; d += step) {
            const gx = Math.floor((x0 + dirX * d) / cs);
            const gy = Math.floor((y0 + dirY * d) / cs);
            if (!this.inBounds(gx, gy)) return false;
            if (MAT_STATE[this.material[this.idx(gx, gy)]] === STATE.SOLID) return true;
        }
        return false;
    }

    // ==================== 消防斧头攻击 ====================
    // (px,py)为玩家位置: 仅破坏与玩家之间无墙体遮挡(有视线)的固体, 防止隔墙破坏
    // 返回命中数组[{x,y,color,destroyed}], 供调用方生成即时命中反馈(火花/震动/碎屑)
    axeAttack(wx, wy, radius, px, py) {
        const { gx: cx, gy: cy } = this.worldToGrid(wx, wy);
        const gr = Math.ceil(radius / this.cellSize);
        const hits = [];
        for (let dy = -gr; dy <= gr; dy++) {
            for (let dx = -gr; dx <= gr; dx++) {
                const nx = cx + dx, ny = cy + dy;
                if (!this.inBounds(nx, ny)) continue;
                if (dx * dx + dy * dy > gr * gr) continue;
                const i = this.idx(nx, ny);
                const mat = this.material[i];
                if (MAT_STATE[mat] !== STATE.SOLID) continue; // 斧头只破坏固体
                // 视线检查: 玩家到该格之间有墙则不破坏(防止隔墙砍)
                const ccx = nx * this.cellSize + this.cellSize * 0.5;
                const ccy = ny * this.cellSize + this.cellSize * 0.5;
                if (this.isOccluded(px, py, ccx, ccy)) continue;
                // 对材质造成伤害
                this.cellHP[i] -= 1.5;
                const destroyed = this.cellHP[i] <= 0;
                hits.push({ x: ccx, y: ccy, color: MAT_PROPS[mat].color, destroyed });
                if (destroyed) {
                    // 材质被摧毁
                    this.material[i] = MAT.EMPTY;
                    this.fire[i] = 0;
                    this.fuel[i] = 0;
                    this.cellHP[i] = 0;
                }
            }
        }
        return hits;
    }

    // ==================== 火焰蔓延算法(需空气接触+多态燃烧) ====================
    updateFire(x, y, i, dt) {
        const mat = this.material[i];

        // === 火药罐: 被点燃或受热达燃点即猛烈爆炸(范围破坏+连锁引爆, 非普通燃烧) ===
        if (mat === MAT.KEG && (this.fire[i] > 0.01 || this.temperature[i] >= MAT_IGNITION[MAT.KEG])) {
            this.material[i] = MAT.EMPTY;
            this.fire[i] = 0; this.fuel[i] = 0;
            this.explode(x, y, 6, 3);
            return;
        }

        // === 空气接触面(相邻EMPTY格数): 固/液/气邻居都隔绝空气, 接触面越大燃烧越快 ===
        const airContact = this.airContact(x, y);

        // 完全密封(0接触面) -> 缺氧熄灭
        if (airContact === 0) {
            this.fire[i] -= 1.5 * dt;
            if (this.fire[i] <= 0) { this.fire[i] = 0; return; }
        }

        // 空气接触系数: 1面≈0.55, 2面≈0.8, 3面≈1.05, 4面≈1.3
        const airFactor = 0.3 + airContact * 0.25;

        // 温度系数: 超过燃点越多燃烧越剧烈(近似Arrhenius动力学)
        const tempFactor = Math.max(0.4, Math.min(1.6, 0.5 + (this.temperature[i] - MAT_IGNITION[mat]) / 600));

        // 随机闪烁扰动(让燃烧不呆板, 模拟真实火焰脚动)
        const flicker = 0.85 + Math.random() * 0.3;

        // 消耗燃料(速率 = 火强 × 空气系数 × 温度系数 × 随机扰动)
        this.fuel[i] -= this.fire[i] * 20 * airFactor * tempFactor * flicker * dt;
        // 燃烧温度上限按材质(汽油1200/沥青1100/火药1000/其余900)
        this.temperature[i] = Math.min(MAT_FIRETEMP[mat], this.temperature[i] + this.fire[i] * 150 * airFactor * dt);

        // 火焰增强(有燃料+有空气接触, 增速受接触面/温度/随机影响)
        if (this.fuel[i] > 0 && airContact > 0) {
            const maxFire = (mat === MAT.CHAR) ? 0.5 : 1.0; // 碳(余烬)燃烧较弱
            const growRate = 0.4 * airFactor * tempFactor * (0.8 + Math.random() * 0.4);
            this.fire[i] = Math.min(maxFire, this.fire[i] + growRate * dt);
        }

        // 燃料耗尽
        if (this.fuel[i] <= 0) {
            if (MAT_STATE[mat] === STATE.SOLID) {
                if (mat === MAT.CHAR) {
                    // 碳烧穿 -> 变为空气(完全烧毁)
                    this.fire[i] -= 1.5 * dt;
                    if (this.fire[i] <= 0) {
                        this.fire[i] = 0;
                        this.material[i] = MAT.EMPTY;
                        this.temperature[i] = Math.max(this.temperature[i], 150);
                    }
                } else {
                    // 材质碳化 -> 变为碳, 继续阴燃(余烬), 最终烧穿
                    this.material[i] = MAT.CHAR;
                    this.cellHP[i] = MAT_HARDNESS[MAT.CHAR];
                    this.fuel[i] = MAT_FUEL[MAT.CHAR];
                    this.temperature[i] = Math.max(this.temperature[i], 450);
                }
            } else {
                // 液体/气体燃料耗尽 -> 直接烧尽消失(无碳化)
                this.fire[i] -= 2.0 * dt;
                if (this.fire[i] <= 0) {
                    this.fire[i] = 0;
                    this.material[i] = MAT.EMPTY;
                    this.temperature[i] = Math.max(this.temperature[i], 100);
                }
            }
        }

        // 8邻域(性能优化: 嵌套dx/dy循环, 零数组分配, 消除GC压力)
        const cols = this.cols, rows = this.rows;

        // === 相邻冷却剂灭火(水/泡沫粒子, 任意火强都生效) ===
        // (修复: 原嵌套在 fire>0.3 蔓延块内, 弱火≤0.3时水无法灭火/冷却,
        //  火强在0.3阈值附近震荡形成永远灭不净的"僵尸火", 显示1%无法过关)
        if (this.fire[i] > 0) {
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= rows) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    if (nx < 0 || nx >= cols) continue;
                    const ni = ny * cols + nx;
                    const nMat = this.material[ni];
                    if (!MAT_COOLANT[nMat]) continue;
                    // 水浇不灭汽油火: 汽油密度720<水1000, 水沉到汽油下方无法覆盖火焰,
                    // 只有泡沫(密度100浮在汽油上)/干粉/CO2能有效灭火(真实油罐火灾常识)
                    if (mat === MAT.GASOLINE && nMat === MAT.WATER) continue;
                    const coolFactor = Math.max(0.4, 1.0 - (this.temperature[ni] - 20) / 300);
                    const suppress = MAT_SUPPRESS[nMat] || 1;
                    // 灭火(水比热容大效率高, 泡沫suppress加倍)
                    this.fire[i] -= this.fire[i] * dt * 8 * coolFactor * suppress;
                    // 嘶嘶水雾: 水/泡沫接触火焰立即产生蒸汽事件(灭火时可见水雾腾起, 不等水沸腾)
                    if (nMat === MAT.WATER && this.steamEvents.length < 100 && Math.random() < this.fire[i] * 0.35 + 0.05) {
                        this.steamEvents.push({ x: nx * this.cellSize + Math.random() * this.cellSize, y: ny * this.cellSize, temp: this.temperature[i], amount: 0.2 });
                    }
                    // 冷却材质(基于比热容: 水吸热多, 材质降温快, 防止复燃)
                    // (平衡调整: 水吸热速率再翻倍 800->1600)
                    this.temperature[i] -= 1600 * dt / MAT_SPECHEAT[mat] * 1000 * suppress;
                    if (this.temperature[i] < 20) this.temperature[i] = 20;
                    // 火加热水温(水比热容大, 升温慢; 吸热再翻倍 1200->2400)
                    this.temperature[ni] += this.fire[i] * 2400 * dt / MAT_SPECHEAT[nMat] * 1000;
                    // 水>=100 -> 相变为蒸汽粒子
                    if (this.temperature[ni] >= 100 && this.material[ni] === MAT.WATER) {
                        this.material[ni] = MAT.STEAM;
                        this.life[ni] = MAT_LIFE[MAT.STEAM];
                        this.fire[ni] = 0; this.fuel[ni] = 0;
                        if (Math.random() < 0.5) this.steamEvents.push({ x: nx * this.cellSize + Math.random() * this.cellSize, y: ny * this.cellSize, temp: this.temperature[ni], amount: 0.3 });
                    }
                    if (this.fire[i] <= 0) { this.fire[i] = 0; break; }
                }
                if (this.fire[i] <= 0) break;
            }
        }

        // 向邻居蔓延(基于材质燃点 + 需要氧气 + 只蔓延到表面; 需火强>0.3)
        if (this.fire[i] > 0.3) {
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= rows) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    if (nx < 0 || nx >= cols) continue;
                    const ni = ny * cols + nx;
                    const nMat = this.material[ni];

                    // 加热邻居(可燃物且有空气接触才能被点燃; 固/液/气皆可)
                    if (MAT_FLAMMABLE[nMat] && this.fire[ni] < 0.01) {
                        this.temperature[ni] += this.fire[i] * 150 * airFactor * dt;
                        // 达到燃点 + 有空气 -> 按概率点燃(温度越高概率越大, 引入随机延迟)
                        if (this.temperature[ni] >= MAT_IGNITION[nMat] && this.airContact(nx, ny) > 0) {
                            const overheat = this.temperature[ni] / MAT_IGNITION[nMat] - 1;
                            const igniteChance = Math.min(1, 0.2 + overheat * 3);
                            if (Math.random() < igniteChance * dt * 10) {
                                this.fire[ni] = 0.15 + Math.random() * 0.15;
                                // 仅未燃烧过的新材质才补满燃料; 已部分燃烧的保留剩余燃料, 防止复燃重置导致无限燃料(1%灭不掉根因)
                                if (this.fuel[ni] <= 0) this.fuel[ni] = MAT_FUEL[nMat];
                            }
                        }
                    }
                    // 金属导热(不燃烧但传热); 铁水被火焰持续加热保持熔融(上限2500°C)
                    if (nMat === MAT.METAL) {
                        this.temperature[ni] += this.fire[i] * 80 * dt;
                    } else if (nMat === MAT.MOLTEN) {
                        this.temperature[ni] = Math.min(2500, this.temperature[ni] + this.fire[i] * 80 * dt);
                    }
                    // 火焰加热周围空气(平衡调整: 热空气形成危险区灼伤玩家, 与水吸热翻倍互相制衡)
                    if (nMat === MAT.EMPTY) {
                        this.temperature[ni] = Math.min(600, this.temperature[ni] + this.fire[i] * 200 * dt);
                    }
                }
            }

            // 产生火焰视觉事件(燃烧越剧烈事件越多, 强度带闪烁)
            const eventChance = this.fire[i] * (0.25 + airFactor * 0.15);
            if (Math.random() < eventChance) {
                this.fireEvents.push({
                    x: x * this.cellSize + Math.random() * this.cellSize,
                    y: y * this.cellSize + Math.random() * this.cellSize * 0.5,
                    intensity: this.fire[i] * (0.7 + Math.random() * 0.5)
                });
            }

            // 飞火火星: 剧烈燃烧(fire>0.5)时低概率崩出带初速的火星粒子,
            // 游戏侧物理飞行(重力/阻力), 落到远处可燃物表面将其点燃(真实飞火蔓延)
            if (this.fire[i] > 0.5 && Math.random() < this.fire[i] * 0.04) {
                this.emberEvents.push({
                    x: x * this.cellSize + Math.random() * this.cellSize,
                    y: y * this.cellSize + Math.random() * this.cellSize * 0.5,
                    vx: (Math.random() - 0.5) * 160,        // 水平向外初速
                    vy: -(80 + Math.random() * 140)         // 向上初速(热气流托起)
                });
            }

            // 网格烟雾: 与水雾(蒸汽)同一套气体粒子(同尺寸同物理, 被固体阻挡不穿墙);
            // 不消散(见moveGas), 总量上限防性能失控
            if (this.smokeCells < 3000 && Math.random() < this.fire[i] * dt * 5 && y - 1 >= 0) {
                const si = this.idx(x, y - 1);
                if (this.material[si] === MAT.EMPTY) {
                    this.material[si] = MAT.SMOKE;
                    this.life[si] = MAT_LIFE[MAT.SMOKE];
                    this.temperature[si] = Math.max(this.temperature[si], 120);
                }
            }
        }

        // 火药粉连锁反应: 燃烧的火药粉高速引燃周围可燃物(火道/导火索效果),
        // 比普通蔓延快得多(直接点火+预热到燃点以上), 形成快速火带
        if (mat === MAT.GUNPOWDER && this.fire[i] > 0.4) {
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= rows) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    if (nx < 0 || nx >= cols) continue;
                    const ni = ny * cols + nx;
                    const nMat = this.material[ni];
                    if (MAT_FLAMMABLE[nMat] && this.fire[ni] < 0.01 && this.airContact(nx, ny) > 0 && Math.random() < 6 * dt) {
                        this.fire[ni] = 0.3 + Math.random() * 0.3;
                        if (this.fuel[ni] <= 0) this.fuel[ni] = MAT_FUEL[nMat];
                        this.temperature[ni] = Math.max(this.temperature[ni], MAT_IGNITION[nMat] + 60);
                    }
                }
            }
        }

        // 自然冷却
        this.temperature[i] = Math.max(20, this.temperature[i] - 15 * dt);
    }

    // 获取某世界坐标处的火焰强度(用于伤害计算)
    getFireAt(wx, wy) {
        const { gx, gy } = this.worldToGrid(wx, wy);
        if (!this.inBounds(gx, gy)) return 0;
        return this.fire[this.idx(gx, gy)];
    }

    // 检测某点附近半径内是否有明显火源(烟雾粒子化后, 用"附近有火"近似"烟雾弥漫", 供氧气系统判定坏空气)
    hasFireNear(wx, wy, r) {
        if (this.getFireAt(wx, wy) > 0.08) return true;
        for (let a = 0; a < 8; a++) {
            const ang = a * Math.PI / 4;
            if (this.getFireAt(wx + Math.cos(ang) * r, wy + Math.sin(ang) * r) > 0.08) return true;
        }
        return false;
    }

    // 获取某区域的平均温度
    getTempAt(wx, wy) {
        const { gx, gy } = this.worldToGrid(wx, wy);
        if (!this.inBounds(gx, gy)) return 20;
        return this.temperature[this.idx(gx, gy)];
    }

    // 获取某世界坐标处的材质类型(用于检测玩家所处气体: 烟雾/CO2/可燃气)
    getMatAt(wx, wy) {
        const { gx, gy } = this.worldToGrid(wx, wy);
        if (!this.inBounds(gx, gy)) return MAT.EMPTY;
        return this.material[this.idx(gx, gy)];
    }

    // 检测某点是否为固体(用于碰撞; 液体/气体不阻挡)
    isSolidAt(wx, wy) {
        const { gx, gy } = this.worldToGrid(wx, wy);
        if (!this.inBounds(gx, gy)) return true;
        return MAT_STATE[this.material[this.idx(gx, gy)]] === STATE.SOLID;
    }
}

// ==================== 通用高性能粒子系统 ====================
// 对象池(无GC) + swap-remove(O(1)删除) + 预渲染精灵缓存(drawImage远快于arc+fill+rgba字符串)
// 统一管理蒸汽/烟雾/火星/碎屑, 分层渲染保证视觉层次
class ParticleSystem {
    constructor(max = 700) {
        this.pool = new Array(max);
        for (let i = 0; i < max; i++) {
            this.pool[i] = {
                type: '', layer: 0, x: 0, y: 0, vx: 0, vy: 0,
                gravity: 0, drag: 0, size: 0, grow: 0, life: 0, decay: 0,
                alpha: 0, wobble: 0, wobbleSpeed: 0, phase: 0, flicker: false, sprite: null
            };
        }
        this.count = 0; // 活跃粒子数, 粒子始终紧凑存于 pool[0..count)
        this.spriteCache = new Map(); // 碎屑颜色精灵缓存
        // 预渲染像素风精灵(低分辨率颗粒), 避免每帧arc+渐变
        this.sprites = {
            steam: this.makeSprite(207, 232, 245, 'square'), // 方块像素: 与液体/固体网格粒子同一套风格
            smoke: this.makeSprite(58, 60, 70, 'square'),    // 深灰方块烟粒(颜色深保证可见, 非特效云团)
            ember: this.makeSprite(255, 170, 40, 'solid'),
            fgas: this.makeSprite(122, 154, 74, 'soft'),
            co2: this.makeSprite(184, 200, 216, 'soft'),
            heat: this.makeSprite(255, 110, 30, 'soft')   // 热空气热浪(橙红软粒子)
        };
    }

    // 生成像素风精灵: 在8x8低分辨率画布上逐像素绘制, 渲染时整数倍放大保持锐利颗粒感
    makeSprite(r, g, b, mode) {
        const res = 8;
        const c = document.createElement('canvas');
        c.width = res; c.height = res;
        const x = c.getContext('2d');
        const cx = (res - 1) / 2, cy = (res - 1) / 2;
        const maxR = res / 2;
        for (let py = 0; py < res; py++) {
            for (let px = 0; px < res; px++) {
                const d = Math.hypot(px - cx, py - cy) / maxR;
                let a = 0;
                if (mode === 'square') {
                    a = 1; // 满填方块(烟雾/水雾: 与网格液体/固体粒子同一套方块像素风)
                } else if (mode === 'solid') {
                    a = d <= 1 ? 1 : 0; // 实心像素块(火星/碎屑)
                } else if (d < 0.45) a = 0.9;   // 量化透明度为3档
                else if (d < 0.8) a = 0.55;      // 保持像素颗粒感
                else if (d <= 1.1) a = 0.25;     // (蒸汽/烟雾软边缘)
                if (a > 0) {
                    x.fillStyle = `rgba(${r},${g},${b},${a})`;
                    x.fillRect(px, py, 1, 1);
                }
            }
        }
        return c;
    }

    // 碎屑按材质颜色缓存精灵(避免重复创建)
    debrisSprite(color) {
        if (!this.spriteCache.has(color)) {
            const n = parseInt(color.slice(1), 16);
            this.spriteCache.set(color, this.makeSprite((n >> 16) & 255, (n >> 8) & 255, n & 255, 'solid'));
        }
        return this.spriteCache.get(color);
    }

    // 生成粒子(池满则丢弃, 不产生对象分配)
    spawn(o) {
        if (this.count >= this.pool.length) return;
        const p = this.pool[this.count++];
        p.type = o.type; p.layer = o.layer;
        p.x = o.x; p.y = o.y;
        p.vx = o.vx; p.vy = o.vy;
        p.gravity = o.gravity; p.drag = o.drag;
        p.size = o.size; p.grow = o.grow;
        p.life = 1; p.decay = o.decay;
        p.alpha = o.alpha;
        p.wobble = o.wobble; p.wobbleSpeed = o.wobbleSpeed;
        p.phase = Math.random() * 6.28;
        p.flicker = o.flicker || false;
        p.sprite = o.sprite || this.sprites[o.type];
    }

    update(dt) {
        for (let i = this.count - 1; i >= 0; i--) {
            const p = this.pool[i];
            p.phase += dt * (p.wobbleSpeed + (p.flicker ? 18 : 0));
            if (p.wobble) p.vx += Math.sin(p.phase) * p.wobble * dt;
            p.vy += p.gravity * dt;
            if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.size += p.grow * dt;
            p.life -= p.decay * dt;
            if (p.life <= 0 || p.size <= 0) {
                // swap-remove: O(1)删除且保持紧凑, 无filter数组重建
                this.count--;
                const t = this.pool[i]; this.pool[i] = this.pool[this.count]; this.pool[this.count] = t;
            }
        }
    }

    // 分层渲染: 0=碎屑/火星(底) 1=烟雾(中) 2=蒸汽(顶)
    render(ctx) {
        const prevSmooth = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false; // 像素风: 精灵放大保持锐利不模糊
        for (let layer = 0; layer < 3; layer++) {
            for (let i = 0; i < this.count; i++) {
                const p = this.pool[i];
                if (p.layer !== layer || p.size < 0.1) continue;
                let a = p.life * p.alpha;
                if (p.flicker) a *= 0.65 + 0.35 * Math.sin(p.phase);
                ctx.globalAlpha = a > 1 ? 1 : (a < 0 ? 0 : a);
                const d = Math.max(1, Math.round(p.size * 2)); // 整数像素尺寸(像素感)
                ctx.drawImage(p.sprite, Math.round(p.x - p.size), Math.round(p.y - p.size), d, d);
            }
        }
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = prevSmooth;
    }

    clear() { this.count = 0; }
}

// 武器列表(与被动装备分离: R循环切换/数字键1-5直选; 被动装备heatshield/tank/scba自动生效)
const WEAPONS = ['hose', 'highpressure', 'foam', 'co2', 'powder'];
const EQUIP_NAMES = { hose: '基础水管', highpressure: '高压水枪', foam: '泡沫喷射', co2: 'CO2灭火器', powder: '干粉灭火器', heatshield: '隔热服', tank: '大水箱', scba: '空气呼吸器' };
// 武器进阶序列: 每通过一关按此顺序解锁下一把副武器(跨关卡保留, 通关全部解锁)
const WEAPON_PROGRESSION = ['hose', 'highpressure', 'foam', 'co2', 'powder'];

// ==================== 消防员角色 ====================
class Firefighter {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 28; this.h = 48;
        this.vx = 0; this.vy = 0;
        this.speed = 200;
        this.jumpForce = -380;
        this.grounded = false;
        this.facing = 1;
        this.health = 100;
        this.water = 100;
        this.maxWater = 100;
        this.spraying = false;
        this.aimAngle = 0;
        this.equipment = ['hose'];
        this.currentEquip = 0;
        this.animFrame = 0;
        this.animTimer = 0;
        this.invincible = 0;
        this.waterRegenRate = 2;
        // 氧气 + 体温系统(超阈值扣血, 装备提升阈值)
        this.oxygen = 100;
        this.maxOxygen = 100;
        this.bodyTemp = 37;       // 体温(°C)
        this.oxygenMin = 25;      // 氧气低于此值开始窒息扣血
        this.tempMax = 45;        // 体温高于此值开始中暑扣血(隔热服提升55)
        this.hasSCBA = false;     // 空气呼吸器(大幅减缓氧气消耗)
        // 消防斧头
        this.axeSwinging = false;
        this.axeTimer = 0;
        this.axeCooldown = 0;
        this.axeAngle = 0;
        this.axeRadius = 30;
        // 攀爬墙壁
        this.climbSpeed = 70;     // 攀墙上升速度(缓慢攀登)
        this.climbing = false;
        this.wallSliding = false; // 贴墙缓降(墙滑)
        this.wallDir = 0;         // 贴墙方向(-1左/1右/0无)
    }

    get weapons() { return this.equipment.filter(e => WEAPONS.includes(e)); }
    get currentEquipment() {
        // 武器与被动装备分离: currentEquip只在武器列表中循环(被动装备自动生效)
        const w = this.weapons;
        if (w.length === 0) return 'hose';
        return w[this.currentEquip % w.length];
    }

    update(dt, keys, grid) {
        let moveX = 0;
        if (keys['a'] || keys['arrowleft']) moveX -= 1;
        if (keys['d'] || keys['arrowright']) moveX += 1;
        this.vx = moveX * this.speed;
        if (moveX !== 0) this.facing = moveX;

        const wantUp = keys['w'] || keys['arrowup'];

        if (wantUp && this.grounded) {
            this.vy = this.jumpForce;
            this.grounded = false;
        }

        this.vy += 900 * dt;

        // === 墙面物理: 攀墙上升 + 贴墙缓降(墙滑) ===
        // 跳跃初期(vy<jumpForce*0.35)不触发攀爬, 保留跳跃上升手感; 之后贴墙按W转为缓慢攀登
        this.climbing = false;
        this.wallSliding = false;
        const wallDir = grid ? this.checkWallContact(grid) : 0;
        this.wallDir = wallDir;
        if (grid && !this.grounded && wallDir !== 0) {
            if (wantUp && this.vy > this.jumpForce * 0.35) {
                // 攀墙: 贴墙按上键沿墙缓慢攀登(取消重力)
                this.climbing = true;
                this.vy = -this.climbSpeed;
            } else if (this.vy > 70) {
                // 墙滑: 下落贴墙时减缓下降速度(最高70px/s), 便于控制落点
                this.wallSliding = true;
                this.vy = 70;
            }
        }

        // === 翻越墙顶(mantle): 攀爬到顶端拐角时自动翻上平台 ===
        if (grid && wantUp) this.tryMantle(grid);

        // 子步进移动: 单帧位移拆成多步(每步<1格), 防止高速下落/移动时穿透薄墙
        const cs = grid ? grid.cellSize : 5;
        const maxStep = cs * 0.9;
        const dx = this.vx * dt, dy = this.vy * dt;
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
        const sdx = dx / steps, sdy = dy / steps;
        this.grounded = false;
        for (let s = 0; s < steps; s++) {
            this.x += sdx;
            if (grid) this.resolveHorizontal(grid, sdx);
            this.y += sdy;
            if (grid) this.resolveVertical(grid, sdy);
        }

        // 地面(动态地面 worldH-30, 兼容加高关卡的垂直滚动)
        const groundY = grid ? grid.worldH - 30 : 570;
        if (this.y + this.h > groundY) {
            this.y = groundY - this.h;
            this.vy = 0;
            this.grounded = true;
        }

        this.animTimer += dt;
        if (this.animTimer > 0.15) { this.animTimer = 0; this.animFrame = (this.animFrame + 1) % 4; }
        if (this.invincible > 0) this.invincible -= dt;
        this.water = Math.min(this.maxWater, this.water + this.waterRegenRate * dt);
        // 斧头冷却和动画
        if (this.axeCooldown > 0) this.axeCooldown -= dt;
        if (this.axeSwinging) {
            this.axeTimer -= dt;
            if (this.axeTimer <= 0) this.axeSwinging = false;
        }
    }

    // 侧面贴墙检测: 返回 -1(左墙) / 1(右墙) / 0(未贴墙)
    // 采样点含脚部(h-2): 保证攀爬能持续到脚到达墙顶, 不会在拐角处提前失去接触
    checkWallContact(grid) {
        const ys = [this.y + this.h * 0.25, this.y + this.h * 0.5, this.y + this.h * 0.75, this.y + this.h - 2];
        for (const cy of ys) if (grid.isSolidAt(this.x - 2, cy)) return -1;
        for (const cy of ys) if (grid.isSolidAt(this.x + this.w + 2, cy)) return 1;
        return 0;
    }

    // 翻越墙顶(mantle): 攀爬到顶端拐角时自动翻上平台
    // 条件: 滞空+按上键+上半身已越过平台边缘(侧面头部高度无墙)+脚部仍在平台边缘旁(侧面脚部高度有墙)
    tryMantle(grid) {
        if (this.grounded) return;
        const cs = grid.cellSize;
        for (const dir of [-1, 1]) {
            const sideX = dir < 0 ? this.x - 3 : this.x + this.w + 3;
            // 头部高度侧面是空的(上半身已越过平台边缘)
            if (grid.isSolidAt(sideX, this.y + this.h * 0.3)) continue;
            // 脚部高度侧面是固体(平台边缘还在脚旁)
            const footY = this.y + this.h * 0.9;
            if (!grid.isSolidAt(sideX, footY)) continue;
            // 从头部高度向下扫描侧面列, 第一个固体格 = 平台边缘, 其上边缘 = 平台顶面
            let ledgeTop = -1, ledgeGx = 0;
            for (let sy = this.y + this.h * 0.3; sy <= footY; sy += cs) {
                if (grid.isSolidAt(sideX, sy)) {
                    const gcell = grid.worldToGrid(sideX, sy);
                    ledgeTop = gcell.gy * cs;
                    ledgeGx = gcell.gx;
                    break;
                }
            }
            if (ledgeTop < 0) continue;
            // 只有平台顶面在头顶以下、脚部以上才是正常翻越高度(防异常传送)
            if (ledgeTop <= this.y || ledgeTop > this.y + this.h) continue;
            // 安全检查: 翻越后身体位置(平台顶面上方)不能是固体
            const targetY = ledgeTop - this.h;
            const centerX = ledgeGx * cs + cs / 2;
            if (grid.isSolidAt(centerX, targetY + this.h * 0.5)) continue;
            // 翻越: 脚踩上平台顶面, 身体居中到平台格上方
            this.y = targetY;
            this.x = centerX - this.w / 2;
            this.vy = 0;
            this.grounded = true;
            this.climbing = false;
            this.wallSliding = false;
            return;
        }
    }

    // 水平碰撞: 基于本步实际位移方向sdx判定(而非vx, 避免碰撞置零vx后后续子步漏检导致穿墙)
    resolveHorizontal(grid, sdx) {
        const cs = grid.cellSize;
        const ys = [this.y + 4, this.y + this.h * 0.5, this.y + this.h - 4];
        if (sdx < 0) {
            for (const cy of ys) {
                if (grid.isSolidAt(this.x, cy)) {
                    const { gx } = grid.worldToGrid(this.x, cy);
                    this.x = (gx + 1) * cs;
                    this.vx = 0;
                    break;
                }
            }
        } else if (sdx > 0) {
            for (const cy of ys) {
                if (grid.isSolidAt(this.x + this.w, cy)) {
                    const { gx } = grid.worldToGrid(this.x + this.w, cy);
                    this.x = gx * cs - this.w;
                    this.vx = 0;
                    break;
                }
            }
        }
    }

    // 垂直碰撞: 基于本步实际位移方向sdy判定(而非vy, 避免碰撞置零vy后后续子步漏检导致穿墙)
    resolveVertical(grid, sdy) {
        const cs = grid.cellSize;
        const xs = [this.x + 4, this.x + this.w / 2, this.x + this.w - 4];
        if (sdy > 0) {
            for (const cx of xs) {
                if (grid.isSolidAt(cx, this.y + this.h)) {
                    const { gy } = grid.worldToGrid(cx, this.y + this.h);
                    this.y = gy * cs - this.h;
                    this.vy = 0;
                    this.grounded = true;
                    break;
                }
            }
        } else if (sdy < 0) {
            for (const cx of xs) {
                if (grid.isSolidAt(cx, this.y)) {
                    const { gy } = grid.worldToGrid(cx, this.y);
                    this.y = (gy + 1) * cs;
                    this.vy = 0;
                    break;
                }
            }
        }
    }

    takeDamage(amount) {
        if (this.invincible > 0) return;
        this.health -= amount;
        this.invincible = 0.5;
        if (this.health < 0) this.health = 0;
    }
    refillWater(amount) { this.water = Math.min(this.maxWater, this.water + amount); }
}

// ==================== 消防设施 ====================
class FireHydrant {
    constructor(x, y) {
        this.x = x; this.y = y; this.w = 24; this.h = 40;
        this.waterSupply = 200; this.maxSupply = 200;
        this.active = false;
    }
}
class WaterTower {
    constructor(x, y) {
        this.x = x; this.y = y; this.w = 60; this.h = 80;
        this.waterSupply = 500; this.maxSupply = 500;
        this.active = false; this.pressure = 1.5;
    }
}

// ==================== 关卡定义 ====================
const LEVELS = [
    {
        name: "第一关：厨房小火", subtitle: "学习基本灭火操作",
        desc: "一栋居民楼的厨房着火了！使用水管扑灭火焰。水会沿网格流动、不可重叠、遇热气化。",
        equipment: "🔧 解锁装备：基础水管", tip: "提示：水遇到高温会产生蒸汽，对准火焰根部喷射效果最好。玻璃窗斧头一击即碎，冰块受热会融化成水",
        playerStart: { x: 80, y: 400 }, worldWidth: 1200, worldHeight: 600,
        structures: [
            { x: 0, y: 570, w: 1200, h: 30, mat: MAT.CONCRETE },
            // === 居民厨房(淘金者式: 规整横板平台 + 垂直墙梯 + 砖外墙) ===
            { x: 200, y: 240, w: 20, h: 330, mat: MAT.WALL },       // 左侧外墙
            { x: 200, y: 240, w: 340, h: 20, mat: MAT.CONCRETE },   // 屋顶楼板
            { x: 520, y: 240, w: 20, h: 140, mat: MAT.WALL },       // 右墙上段
            { x: 520, y: 480, w: 20, h: 90, mat: MAT.WALL },        // 右墙下段
            { x: 520, y: 380, w: 20, h: 100, mat: MAT.DOOR },       // 厨房木门(可斧头破拆)
            // 第1层平台(厨房台面: 混凝土板+木柜腿)
            { x: 280, y: 430, w: 200, h: 15, mat: MAT.CONCRETE },
            { x: 285, y: 445, w: 15, h: 125, mat: MAT.WOOD },
            { x: 370, y: 445, w: 15, h: 125, mat: MAT.WOOD },
            { x: 460, y: 445, w: 15, h: 125, mat: MAT.WOOD },
            // 第2层平台(吊柜横板) + 垂直墙梯(连接1/2层, 可攀爬)
            { x: 300, y: 320, w: 180, h: 15, mat: MAT.WOOD },
            { x: 480, y: 320, w: 15, h: 110, mat: MAT.WALL },       // 墙梯(1层→2层)
            // 右侧木货架塔(横板+砖立柱) + 墙梯(地面→货架)
            { x: 600, y: 350, w: 160, h: 15, mat: MAT.WOOD },
            { x: 600, y: 365, w: 15, h: 205, mat: MAT.WALL },
            { x: 745, y: 365, w: 15, h: 205, mat: MAT.WALL },
            { x: 580, y: 350, w: 15, h: 220, mat: MAT.WALL },       // 墙梯(地面→货架)
            // 右侧木柜(台面+柜腿)
            { x: 820, y: 460, w: 130, h: 15, mat: MAT.WOOD },
            { x: 825, y: 475, w: 12, h: 95, mat: MAT.WOOD },
            { x: 938, y: 475, w: 12, h: 95, mat: MAT.WOOD },
            // 左外墙玻璃窗(后放置覆盖墙体; FC破窗玩法: 斧头一击即碎, 从窗口直入2层)
            { x: 200, y: 290, w: 20, h: 60, mat: MAT.GLASS },
            // 货架上冰箱冰块(教学: 火烤融化成水浇灭旁边的火, 现场水源)
            { x: 710, y: 310, w: 45, h: 40, mat: MAT.ICE },
            // 右侧红砖阶梯(FC马里奥式, 登顶灭火)
            { x: 1000, y: 530, w: 40, h: 40, mat: MAT.BRICK },
            { x: 1040, y: 490, w: 40, h: 80, mat: MAT.BRICK },
            { x: 1080, y: 450, w: 40, h: 120, mat: MAT.BRICK },
        ],
        fires: [
            { x: 340, y: 390, w: 40, h: 40, mat: MAT.WOOD },        // 1层台面上
            { x: 350, y: 280, w: 30, h: 35, mat: MAT.PAPER },       // 2层吊柜上
            { x: 660, y: 310, w: 40, h: 40, mat: MAT.PAPER },       // 货架上(冰块旁, 融冰演示)
            { x: 1090, y: 410, w: 30, h: 40, mat: MAT.PAPER },      // 红砖阶梯顶
        ],
        hydrants: [{ x: 150, y: 530 }], towers: [],
        equipUnlock: ['hose'],
        victims: [{ x: 450, y: 520 }],
        sprinklers: [], fireSwitches: []
    },
    {
        name: "第二关：仓库大火", subtitle: "火焰蔓延与消防栓",
        desc: "仓库中的木箱着火了，火焰正沿网格蔓延！利用消防栓补充水源，阻止火焰扩散到燃料桶。",
        equipment: "🔧 解锁装备：高压水枪（射程更远，水压更大）", tip: "提示：靠近消防栓自动缓慢补水。高压水枪可以远距离灭火。按E键互动水塔/消防开关",
        playerStart: { x: 60, y: 400 }, worldWidth: 1600, worldHeight: 600,
        structures: [
            { x: 0, y: 570, w: 1600, h: 30, mat: MAT.CONCRETE },
            // === 仓库(淘金者式: 砖外墙 + 2层横板平台网格 + 垂直墙梯) ===
            { x: 200, y: 300, w: 20, h: 270, mat: MAT.WALL },       // 左墙
            { x: 200, y: 300, w: 420, h: 20, mat: MAT.CONCRETE },   // 屋顶
            // 第1层平台(木箱堆: 混凝土板+砖立柱)
            { x: 250, y: 450, w: 200, h: 20, mat: MAT.CONCRETE },
            { x: 250, y: 470, w: 15, h: 100, mat: MAT.WALL },
            { x: 435, y: 470, w: 15, h: 100, mat: MAT.WALL },
            // 第2层平台(高层木箱) + 墙梯(1层→2层)
            { x: 300, y: 360, w: 200, h: 15, mat: MAT.WOOD },
            { x: 460, y: 360, w: 15, h: 90, mat: MAT.WALL },        // 墙梯(1层→2层)
            // 小木箱(燃料)
            { x: 600, y: 500, w: 60, h: 70, mat: MAT.WOOD },
            // 内隔墙(带门洞)
            { x: 750, y: 350, w: 20, h: 100, mat: MAT.WALL },
            { x: 750, y: 520, w: 20, h: 50, mat: MAT.WALL },
            { x: 750, y: 450, w: 20, h: 70, mat: MAT.DOOR },        // 仓库木门
            // 货架平台(混凝土板+砖立柱) + 墙梯(地面→货架)
            { x: 900, y: 450, w: 150, h: 20, mat: MAT.CONCRETE },
            { x: 900, y: 470, w: 15, h: 100, mat: MAT.WALL },
            { x: 1035, y: 470, w: 15, h: 100, mat: MAT.WALL },
            { x: 880, y: 450, w: 15, h: 120, mat: MAT.WALL },       // 墙梯(地面→货架)
            // 右侧墙(带门洞)
            { x: 1100, y: 380, w: 20, h: 80, mat: MAT.WALL },
            { x: 1100, y: 530, w: 20, h: 40, mat: MAT.WALL },
            { x: 1100, y: 460, w: 20, h: 70, mat: MAT.DOOR },       // 侧门
            { x: 1200, y: 480, w: 80, h: 90, mat: MAT.WOOD },       // 木箱
            // 屋顶玻璃天窗(后放置覆盖屋顶; 可破拆从上方向下灭火)
            { x: 380, y: 300, w: 80, h: 20, mat: MAT.GLASS },
            // 左外墙玻璃窗(破窗进仓库)
            { x: 200, y: 350, w: 20, h: 60, mat: MAT.GLASS },
            // 地面油污(蔓延危险源: 火星掉落即成火路)
            { x: 790, y: 555, w: 60, h: 15, mat: MAT.OIL },
            // === 右端冷库(砖墙房+木门+冰块堆: 火烤融化成水可反哺灭火) ===
            { x: 1350, y: 400, w: 200, h: 15, mat: MAT.CONCRETE },  // 冷库顶
            { x: 1350, y: 415, w: 15, h: 155, mat: MAT.WALL },      // 冷库左墙
            { x: 1535, y: 415, w: 15, h: 155, mat: MAT.WALL },      // 冷库右墙
            { x: 1350, y: 500, w: 15, h: 70, mat: MAT.DOOR },       // 冷库门(覆盖左墙下段)
            { x: 1400, y: 490, w: 110, h: 80, mat: MAT.ICE },       // 冰块堆
        ],
        fires: [
            { x: 280, y: 410, w: 60, h: 40, mat: MAT.WOOD },        // 1层平台上
            { x: 320, y: 320, w: 80, h: 40, mat: MAT.WOOD },        // 2层平台上
            { x: 610, y: 460, w: 40, h: 40, mat: MAT.WOOD },        // 小木箱上
            { x: 950, y: 410, w: 50, h: 40, mat: MAT.PAPER },       // 货架上
            { x: 1210, y: 440, w: 60, h: 40, mat: MAT.FUEL },       // 木箱上
        ],
        hydrants: [{ x: 100, y: 530 }, { x: 850, y: 530 }], towers: [{ x: 1160, y: 250 }],
        equipUnlock: ['hose', 'highpressure'],
        victims: [{ x: 650, y: 520 }, { x: 1150, y: 520 }],
        sprinklers: [{ x: 290, y: 330 }, { x: 450, y: 330 }, { x: 600, y: 330 }],
        fireSwitches: [{ x: 130, y: 500 }]
    },
    {
        name: "第三关：高楼救援", subtitle: "水塔增压与多层建筑",
        desc: "一栋多层建筑起火！利用楼顶水塔的高水压从上方灭火。火焰正在沿材质向上蔓延！",
        equipment: "🔧 解锁装备：泡沫喷射器（覆盖面积大） + CO2灭火器（下沉气体覆盖隔氧）", tip: "提示：按E打开水塔阀门向下放水。CO2比空气重, 会下沉覆盖燃料表面隔绝氧气。接近受害者自动拾起, 送回左侧安全区",
        playerStart: { x: 60, y: 1300 }, worldWidth: 1400, worldHeight: 1400,
        structures: [
            { x: 0, y: 1370, w: 1400, h: 30, mat: MAT.CONCRETE },
            // === 电梯大战式高楼: 8层等间距楼板 + 贯穿电梯井(墙梯可攀爬) + 屋顶水塔 ===
            { x: 300, y: 250, w: 20, h: 1040, mat: MAT.WALL },      // 左外墙(y1290下为入口开间)
            { x: 980, y: 250, w: 20, h: 1120, mat: MAT.WALL },      // 右外墙
            { x: 300, y: 250, w: 460, h: 20, mat: MAT.CONCRETE },   // 屋顶(左段, 电梯井上方留开口)
            { x: 880, y: 250, w: 120, h: 20, mat: MAT.CONCRETE },   // 屋顶(右段)
            { x: 740, y: 250, w: 20, h: 1120, mat: MAT.WALL },      // 电梯井墙梯(全高可攀爬, 上下通道)
            // 楼板(左段x320-740 + 右侧走廊x880-980, 中间x760-880为电梯井空腔)
            { x: 320, y: 390, w: 420, h: 20, mat: MAT.CONCRETE },
            { x: 880, y: 390, w: 100, h: 20, mat: MAT.CONCRETE },
            { x: 320, y: 530, w: 420, h: 20, mat: MAT.CONCRETE },
            { x: 880, y: 530, w: 100, h: 20, mat: MAT.CONCRETE },
            { x: 320, y: 670, w: 420, h: 20, mat: MAT.CONCRETE },
            { x: 880, y: 670, w: 100, h: 20, mat: MAT.CONCRETE },
            { x: 320, y: 810, w: 420, h: 20, mat: MAT.CONCRETE },
            { x: 880, y: 810, w: 100, h: 20, mat: MAT.CONCRETE },
            { x: 320, y: 950, w: 420, h: 20, mat: MAT.CONCRETE },
            { x: 880, y: 950, w: 100, h: 20, mat: MAT.CONCRETE },
            { x: 320, y: 1090, w: 420, h: 20, mat: MAT.CONCRETE },
            { x: 880, y: 1090, w: 100, h: 20, mat: MAT.CONCRETE },
            { x: 320, y: 1230, w: 420, h: 20, mat: MAT.CONCRETE },
            { x: 880, y: 1230, w: 100, h: 20, mat: MAT.CONCRETE },
            // 室内隔墙(带门, 电梯大战式房间)
            { x: 540, y: 850, w: 15, h: 30, mat: MAT.WALL },
            { x: 540, y: 880, w: 15, h: 70, mat: MAT.DOOR },        // 3层隔间门
            { x: 560, y: 570, w: 15, h: 30, mat: MAT.WALL },
            { x: 560, y: 600, w: 15, h: 70, mat: MAT.DOOR },        // 5层隔间门
            // 外墙玻璃窗(后放置覆盖外墙; FC破窗入楼: 斧头一击即碎)
            { x: 300, y: 1140, w: 20, h: 80, mat: MAT.GLASS },      // 1层左窗
            { x: 300, y: 860, w: 20, h: 80, mat: MAT.GLASS },       // 3层左窗
            { x: 300, y: 580, w: 20, h: 80, mat: MAT.GLASS },       // 5层左窗
            { x: 980, y: 1000, w: 20, h: 80, mat: MAT.GLASS },      // 2层右窗
            { x: 980, y: 720, w: 20, h: 80, mat: MAT.GLASS },       // 4层右窗
            // 楼外红砖消防梯(FC平台+可攀爬砖柱, 直通1/3层窗口破窗而入)
            { x: 150, y: 1240, w: 15, h: 130, mat: MAT.BRICK },     // 砖柱(地面→平台1)
            { x: 165, y: 1240, w: 120, h: 15, mat: MAT.BRICK },     // 平台1(对1层窗)
            { x: 150, y: 960, w: 15, h: 280, mat: MAT.BRICK },      // 砖柱(平台1→平台2)
            { x: 165, y: 960, w: 120, h: 15, mat: MAT.BRICK },      // 平台2(对3层窗)
            // 楼内木家具(可燃物/景观)
            { x: 380, y: 1200, w: 80, h: 30, mat: MAT.WOOD },       // 1层木桌
            { x: 600, y: 1060, w: 70, h: 30, mat: MAT.WOOD },       // 2层木桌
            { x: 420, y: 500, w: 80, h: 30, mat: MAT.WOOD },        // 6层木桌
            // 屋顶红砖女儿墙(FC装饰垛口) + 冰水箱(火场热气升温融化成应急水)
            { x: 320, y: 220, w: 15, h: 30, mat: MAT.BRICK },
            { x: 540, y: 220, w: 15, h: 30, mat: MAT.BRICK },
            { x: 725, y: 220, w: 15, h: 30, mat: MAT.BRICK },
            { x: 400, y: 190, w: 60, h: 60, mat: MAT.ICE },
        ],
        fires: [
            { x: 400, y: 1190, w: 60, h: 40, mat: MAT.WOOD },       // 1层
            { x: 500, y: 1050, w: 40, h: 40, mat: MAT.PAPER },      // 2层
            { x: 400, y: 910, w: 50, h: 40, mat: MAT.WOOD },        // 3层
            { x: 600, y: 770, w: 60, h: 40, mat: MAT.FUEL },        // 4层
            { x: 450, y: 630, w: 50, h: 40, mat: MAT.WOOD },        // 5层
            { x: 550, y: 490, w: 60, h: 40, mat: MAT.WOOD },        // 6层
        ],
        hydrants: [{ x: 80, y: 1330 }, { x: 600, y: 1330 }],
        towers: [{ x: 820, y: 180 }],
        equipUnlock: ['hose', 'highpressure', 'foam', 'co2'],
        victims: [{ x: 650, y: 910 }, { x: 900, y: 630 }],
        sprinklers: [{ x: 520, y: 975 }, { x: 630, y: 695 }, { x: 580, y: 415 }],
        fireSwitches: [{ x: 100, y: 1330 }]
    },
    {
        name: "第四关：化工厂区", subtitle: "燃料爆炸与极端火势",
        desc: "化工厂区发生爆炸！燃料桶四处起火，温度极高。钢框架被大火加热会快速导热引燃高处木箱，超过2000°C还会熔化成铁水坍塌！",
        equipment: "🔧 解锁装备：干粉灭火器（粉末覆盖隔氧） + 隔热服（减少火焰伤害/提升体温阈值）", tip: "提示：燃料火焰温度极高。干粉落下覆盖燃料隔绝氧气。钢材导热极快, 火会沿钢架蔓延到顶部木箱, 钢架超2000°C熔化成铁水",
        playerStart: { x: 60, y: 400 }, worldWidth: 2000, worldHeight: 600,
        structures: [
            { x: 0, y: 570, w: 2000, h: 30, mat: MAT.CONCRETE },
            // === 化工厂区(淘金者式工业: 规整平台网格 + 墙梯 + 钢框架 + 金属储罐) ===
            // 左侧储罐区
            { x: 300, y: 450, w: 100, h: 120, mat: MAT.METAL },      // 金属储罐
            { x: 500, y: 400, w: 20, h: 90, mat: MAT.WALL },
            { x: 500, y: 540, w: 20, h: 30, mat: MAT.WALL },
            { x: 500, y: 490, w: 20, h: 50, mat: MAT.DOOR },        // 厂房门
            { x: 600, y: 480, w: 80, h: 90, mat: MAT.METAL },       // 储罐
            // 第1层平台(混凝土板+砖立柱) + 墙梯(地面→1层)
            { x: 780, y: 440, w: 220, h: 20, mat: MAT.CONCRETE },
            { x: 780, y: 460, w: 15, h: 110, mat: MAT.WALL },
            { x: 985, y: 460, w: 15, h: 110, mat: MAT.WALL },
            { x: 750, y: 440, w: 15, h: 130, mat: MAT.WALL },       // 墙梯(地面→1层)
            // 第2层平台(高位) + 墙梯(1层→2层)
            { x: 850, y: 320, w: 160, h: 15, mat: MAT.CONCRETE },
            { x: 990, y: 320, w: 15, h: 120, mat: MAT.WALL },       // 墙梯(1层→2层)
            // 大型储罐
            { x: 1100, y: 450, w: 150, h: 120, mat: MAT.METAL },    // 大型储罐
            // 侧墙带门
            { x: 1350, y: 380, w: 20, h: 100, mat: MAT.WALL },
            { x: 1350, y: 530, w: 20, h: 40, mat: MAT.WALL },
            { x: 1350, y: 480, w: 20, h: 50, mat: MAT.DOOR },       // 侧门
            // 钢框架建筑: 钢柱+钢梁+木箱(底部火灾经钢材高导热传至顶部引燃木箱, 钢架超2000°C会熔化成铁水坍塌)
            { x: 1480, y: 330, w: 15, h: 240, mat: MAT.METAL },
            { x: 1680, y: 330, w: 15, h: 240, mat: MAT.METAL },
            { x: 1480, y: 330, w: 215, h: 15, mat: MAT.METAL },
            { x: 1480, y: 440, w: 215, h: 15, mat: MAT.METAL },
            { x: 1520, y: 290, w: 60, h: 40, mat: MAT.WOOD },
            { x: 1600, y: 400, w: 60, h: 40, mat: MAT.WOOD },
            // 右侧平台 + 墙梯(地面→平台)
            { x: 1700, y: 420, w: 150, h: 20, mat: MAT.CONCRETE },
            { x: 1830, y: 420, w: 15, h: 150, mat: MAT.WALL },      // 墙梯(地面→平台)
            // 危险品
            { x: 1080, y: 555, w: 140, h: 15, mat: MAT.OIL },
            { x: 470, y: 250, w: 60, h: 50, mat: MAT.FGAS },
            // 火药罐(受热即爆炸, 注意隔离)
            { x: 450, y: 545, w: 30, h: 25, mat: MAT.KEG },
            { x: 1420, y: 545, w: 30, h: 25, mat: MAT.KEG },
            // 左侧液氮冰堆(化工冷剂: 受热融化成水池, 可攀越)
            { x: 180, y: 500, w: 60, h: 70, mat: MAT.ICE },
            // 2层平台火源旁冰罐(融冰自动灭火演示)
            { x: 950, y: 280, w: 50, h: 40, mat: MAT.ICE },
            // 控制室玻璃观察窗(后放置覆盖厂房墙上段, 可破窗)
            { x: 500, y: 420, w: 20, h: 60, mat: MAT.GLASS },
            // 大储罐旁玻璃顶棚(挡飞火火星, 不挡水平通行, 可破拆)
            { x: 1255, y: 455, w: 90, h: 12, mat: MAT.GLASS },
            // 右端红砖阶梯(FC马里奥式登高点)
            { x: 1880, y: 530, w: 40, h: 40, mat: MAT.BRICK },
            { x: 1920, y: 490, w: 40, h: 80, mat: MAT.BRICK },
            { x: 1960, y: 450, w: 40, h: 120, mat: MAT.BRICK },
        ],
        fires: [
            { x: 310, y: 410, w: 80, h: 40, mat: MAT.FUEL },        // 储罐顶
            { x: 610, y: 440, w: 60, h: 40, mat: MAT.FUEL },        // 储罐顶
            { x: 820, y: 400, w: 60, h: 40, mat: MAT.WOOD },        // 1层平台
            { x: 880, y: 280, w: 50, h: 40, mat: MAT.FUEL },        // 2层平台
            { x: 1120, y: 410, w: 100, h: 40, mat: MAT.FUEL },      // 大储罐顶
            { x: 1490, y: 530, w: 60, h: 40, mat: MAT.FUEL },       // 钢框架底部
            { x: 1720, y: 380, w: 60, h: 40, mat: MAT.FUEL },       // 右侧平台
            { x: 1780, y: 380, w: 50, h: 40, mat: MAT.PAPER },      // 右侧平台
        ],
        hydrants: [{ x: 100, y: 530 }, { x: 720, y: 530 }, { x: 1400, y: 530 }],
        towers: [{ x: 1050, y: 250 }],
        equipUnlock: ['hose', 'highpressure', 'foam', 'co2', 'powder', 'heatshield'],
        victims: [{ x: 550, y: 530 }, { x: 1280, y: 530 }],
        sprinklers: [{ x: 870, y: 270 }, { x: 950, y: 270 }],
        fireSwitches: [{ x: 130, y: 500 }]
    },
    {
        name: "第五关：城市危机", subtitle: "终极挑战 - 全城大火",
        desc: "整条街道陷入火海！所有装备已解锁，利用一切消防设施扑灭这场城市大火！",
        equipment: "🔧 全部装备已解锁（含SCBA空气呼吸器/大容量水箱）", tip: "提示：SCBA大幅减缓氧气消耗。燃料火焰温度极高, 金属建筑导热快, 火药罐受热即爆炸, 注意隔离火源",
        playerStart: { x: 60, y: 1100 }, worldWidth: 2400, worldHeight: 1200,
        structures: [
            { x: 0, y: 1170, w: 2400, h: 30, mat: MAT.CONCRETE },
            // === A栋(电梯大战式: 等间距楼板 + 贯穿电梯井墙梯 + 屋顶水塔) x200-800 ===
            { x: 200, y: 300, w: 20, h: 790, mat: MAT.WALL },       // 左外墙(y1090下为入口开间)
            { x: 780, y: 300, w: 20, h: 870, mat: MAT.WALL },       // 右外墙
            { x: 200, y: 300, w: 380, h: 20, mat: MAT.CONCRETE },   // 屋顶左段(电梯井上方留开口)
            { x: 720, y: 300, w: 80, h: 20, mat: MAT.CONCRETE },    // 屋顶右段
            { x: 580, y: 300, w: 20, h: 870, mat: MAT.WALL },       // 电梯井墙梯(全高可攀爬)
            // 楼板(左段x220-580 + 右廊x720-780, 中间x600-720为电梯井空腔)
            { x: 220, y: 440, w: 360, h: 20, mat: MAT.CONCRETE },
            { x: 720, y: 440, w: 60, h: 20, mat: MAT.CONCRETE },
            { x: 220, y: 580, w: 360, h: 20, mat: MAT.CONCRETE },
            { x: 720, y: 580, w: 60, h: 20, mat: MAT.CONCRETE },
            { x: 220, y: 720, w: 360, h: 20, mat: MAT.CONCRETE },
            { x: 720, y: 720, w: 60, h: 20, mat: MAT.CONCRETE },
            { x: 220, y: 860, w: 360, h: 20, mat: MAT.CONCRETE },
            { x: 720, y: 860, w: 60, h: 20, mat: MAT.CONCRETE },
            { x: 220, y: 1000, w: 360, h: 20, mat: MAT.CONCRETE },
            { x: 720, y: 1000, w: 60, h: 20, mat: MAT.CONCRETE },
            // === 中部街区(淘金者式: 木箱+平台网格+砖柱墙梯) x800-1360 ===
            { x: 800, y: 1080, w: 100, h: 90, mat: MAT.WOOD },      // 木箱堆
            { x: 980, y: 1000, w: 200, h: 20, mat: MAT.CONCRETE },  // 1层平台
            { x: 980, y: 1020, w: 15, h: 150, mat: MAT.WALL },      // 左砖柱(可攀爬)
            { x: 1165, y: 1020, w: 15, h: 150, mat: MAT.WALL },     // 右砖柱
            { x: 1030, y: 860, w: 180, h: 15, mat: MAT.WOOD },      // 2层平台
            { x: 1190, y: 860, w: 15, h: 140, mat: MAT.WALL },      // 墙梯(1层→2层)
            { x: 1240, y: 1050, w: 120, h: 120, mat: MAT.METAL },   // 金属建筑
            // === B栋(电梯大战式) x1400-1960 ===
            { x: 1400, y: 400, w: 20, h: 690, mat: MAT.WALL },      // 左外墙(y1090下为入口开间)
            { x: 1940, y: 400, w: 20, h: 770, mat: MAT.WALL },      // 右外墙
            { x: 1400, y: 400, w: 340, h: 20, mat: MAT.CONCRETE },  // 屋顶左段(电梯井上方留开口)
            { x: 1880, y: 400, w: 80, h: 20, mat: MAT.CONCRETE },   // 屋顶右段
            { x: 1740, y: 400, w: 20, h: 770, mat: MAT.WALL },      // 电梯井墙梯(全高可攀爬)
            // 楼板(左段x1420-1740 + 右廊x1880-1940, 中间x1760-1880为电梯井空腔)
            { x: 1420, y: 540, w: 320, h: 20, mat: MAT.CONCRETE },
            { x: 1880, y: 540, w: 60, h: 20, mat: MAT.CONCRETE },
            { x: 1420, y: 680, w: 320, h: 20, mat: MAT.CONCRETE },
            { x: 1880, y: 680, w: 60, h: 20, mat: MAT.CONCRETE },
            { x: 1420, y: 820, w: 320, h: 20, mat: MAT.CONCRETE },
            { x: 1880, y: 820, w: 60, h: 20, mat: MAT.CONCRETE },
            { x: 1420, y: 960, w: 320, h: 20, mat: MAT.CONCRETE },
            { x: 1880, y: 960, w: 60, h: 20, mat: MAT.CONCRETE },
            // === 右侧街区 x2000-2400 ===
            { x: 2000, y: 1050, w: 130, h: 120, mat: MAT.METAL },   // 金属建筑
            { x: 2230, y: 1080, w: 90, h: 90, mat: MAT.WOOD },      // 木箱
            // 火药罐(城市危险品)
            { x: 1050, y: 1145, w: 30, h: 25, mat: MAT.KEG },
            { x: 2200, y: 1145, w: 30, h: 25, mat: MAT.KEG },
            // A栋玻璃幕墙窗(后放置覆盖外墙; 破窗入楼捷径)
            { x: 200, y: 480, w: 20, h: 80, mat: MAT.GLASS },       // A栋高层左窗
            { x: 200, y: 750, w: 20, h: 80, mat: MAT.GLASS },       // A栋中层左窗
            { x: 780, y: 900, w: 20, h: 80, mat: MAT.GLASS },       // A栋低层右窗
            // B栋玻璃幕墙窗
            { x: 1400, y: 580, w: 20, h: 80, mat: MAT.GLASS },      // B栋高层左窗
            { x: 1400, y: 860, w: 20, h: 80, mat: MAT.GLASS },      // B栋低层左窗
            { x: 1940, y: 720, w: 20, h: 80, mat: MAT.GLASS },      // B栋中层右窗
            // 屋顶冰水箱(火场热气升温融化成应急水源)
            { x: 350, y: 240, w: 60, h: 60, mat: MAT.ICE },         // A栋屋顶
            { x: 1500, y: 340, w: 60, h: 60, mat: MAT.ICE },        // B栋屋顶
            // 中部2层平台冰块(火源旁, 融冰自动灭火演示)
            { x: 1120, y: 820, w: 40, h: 40, mat: MAT.ICE },
            // 街面油污(金属建筑前, 飞火落地即成火路)
            { x: 1185, y: 1155, w: 50, h: 15, mat: MAT.OIL },
            // 右端红砖阶梯(FC式, 登上木箱顶灭火)
            { x: 2330, y: 1130, w: 35, h: 40, mat: MAT.BRICK },
            { x: 2365, y: 1090, w: 35, h: 80, mat: MAT.BRICK },
        ],
        fires: [
            { x: 300, y: 960, w: 60, h: 40, mat: MAT.WOOD },        // A栋1层(楼板y1000)
            { x: 400, y: 820, w: 40, h: 40, mat: MAT.PAPER },       // A栋2层(楼板y860)
            { x: 300, y: 680, w: 60, h: 40, mat: MAT.FUEL },        // A栋3层(楼板y720)
            { x: 820, y: 1040, w: 60, h: 40, mat: MAT.WOOD },       // 中部木箱上
            { x: 1080, y: 960, w: 60, h: 40, mat: MAT.FUEL },       // 中部1层平台
            { x: 1050, y: 820, w: 40, h: 40, mat: MAT.PAPER },      // 中部2层平台
            { x: 1500, y: 920, w: 60, h: 40, mat: MAT.FUEL },       // B栋1层(楼板y960)
            { x: 1600, y: 780, w: 50, h: 40, mat: MAT.WOOD },       // B栋2层(楼板y820)
            { x: 1500, y: 640, w: 60, h: 40, mat: MAT.FUEL },       // B栋3层(楼板y680)
            { x: 1550, y: 500, w: 60, h: 40, mat: MAT.FUEL },       // B栋4层(楼板y540)
            { x: 2250, y: 1040, w: 60, h: 40, mat: MAT.WOOD },      // 右侧木箱上
        ],
        hydrants: [{ x: 100, y: 1130 }, { x: 930, y: 1130 }, { x: 1380, y: 1130 }, { x: 2150, y: 1130 }],
        towers: [{ x: 650, y: 230 }, { x: 1820, y: 330 }],
        equipUnlock: ['hose', 'highpressure', 'foam', 'co2', 'powder', 'heatshield', 'tank', 'scba'],
        victims: [{ x: 250, y: 400 }, { x: 1450, y: 780 }],
        sprinklers: [{ x: 400, y: 745 }, { x: 300, y: 605 }, { x: 1600, y: 705 }],
        fireSwitches: [{ x: 160, y: 1130 }]
    },
    {
        name: "第六关：森林火灾", subtitle: "野外救火与紧急疏散",
        desc: "森林大火正在蔓延！草地和树木极易燃烧，火势随风快速扩散。救出被困的露营者，隔离火带阻止蔓延！",
        equipment: "🔧 解锁装备：全部装备（含隔热服/SCBA）", tip: "提示：草地极易燃，火会快速横向蔓延。优先救人，再隔离火带（清除前方草地）",
        playerStart: { x: 60, y: 450 }, worldWidth: 2400, worldHeight: 600,
        structures: [
            { x: 0, y: 570, w: 2400, h: 30, mat: MAT.CONCRETE },
            // 草地覆盖层(极易燃植被)
            { x: 150, y: 545, w: 2200, h: 25, mat: MAT.GRASS },
            // 树木(木柱+树冠草地)
            { x: 300, y: 440, w: 20, h: 105, mat: MAT.WOOD },
            { x: 270, y: 400, w: 80, h: 45, mat: MAT.GRASS },
            { x: 550, y: 420, w: 20, h: 125, mat: MAT.WOOD },
            { x: 520, y: 380, w: 80, h: 45, mat: MAT.GRASS },
            { x: 800, y: 450, w: 20, h: 95, mat: MAT.WOOD },
            { x: 770, y: 410, w: 80, h: 45, mat: MAT.GRASS },
            { x: 1050, y: 430, w: 20, h: 115, mat: MAT.WOOD },
            { x: 1020, y: 390, w: 80, h: 45, mat: MAT.GRASS },
            { x: 1300, y: 440, w: 20, h: 105, mat: MAT.WOOD },
            { x: 1270, y: 400, w: 80, h: 45, mat: MAT.GRASS },
            { x: 1600, y: 420, w: 20, h: 125, mat: MAT.WOOD },
            { x: 1570, y: 380, w: 80, h: 45, mat: MAT.GRASS },
            { x: 1900, y: 450, w: 20, h: 95, mat: MAT.WOOD },
            { x: 1870, y: 410, w: 80, h: 45, mat: MAT.GRASS },
            { x: 2150, y: 430, w: 20, h: 115, mat: MAT.WOOD },
            { x: 2120, y: 390, w: 80, h: 45, mat: MAT.GRASS },
            // === 树屋(FC式高架平台+墙梯, 增加纵向通行/高处灭火) ===
            { x: 380, y: 340, w: 180, h: 15, mat: MAT.WOOD },       // 树屋A平台(树冠上方)
            { x: 360, y: 340, w: 15, h: 205, mat: MAT.WALL },       // 墙梯(草地→树屋A)
            { x: 1230, y: 340, w: 180, h: 15, mat: MAT.WOOD },      // 树屋B平台
            { x: 1415, y: 340, w: 15, h: 205, mat: MAT.WALL },      // 墙梯(草地→树屋B)
            { x: 1820, y: 340, w: 180, h: 15, mat: MAT.WOOD },      // 树屋C平台
            { x: 1800, y: 340, w: 15, h: 205, mat: MAT.WALL },      // 墙梯(草地→树屋C)
            // 火药罐(露营物资爆炸物)
            { x: 700, y: 520, w: 30, h: 25, mat: MAT.KEG },
            { x: 1450, y: 520, w: 30, h: 25, mat: MAT.KEG },
            // 岩石隔离带(不可燃)
            { x: 1150, y: 500, w: 60, h: 70, mat: MAT.CONCRETE },
            // 岩石上冰墙(受热融化成水流向两侧, 强化隔离带)
            { x: 1155, y: 440, w: 50, h: 60, mat: MAT.ICE },
            // 冰冻池塘(后放置覆盖草地段; 火烧到即融化成水沟, 天然防火带)
            { x: 930, y: 545, w: 110, h: 25, mat: MAT.ICE },
            // 露营天幕帐篷(纸顶+木杆, 易燃危险物)
            { x: 1670, y: 495, w: 80, h: 12, mat: MAT.PAPER },
            { x: 1675, y: 507, w: 10, h: 38, mat: MAT.WOOD },
            { x: 1735, y: 507, w: 10, h: 38, mat: MAT.WOOD },
            // === 护林员木屋(受困者避难所: 破玻璃窗/破门救人) ===
            { x: 1985, y: 430, w: 115, h: 15, mat: MAT.WOOD },      // 屋顶
            { x: 1985, y: 445, w: 15, h: 100, mat: MAT.WOOD },      // 左墙
            { x: 2085, y: 445, w: 15, h: 100, mat: MAT.WOOD },      // 右墙
            { x: 2085, y: 475, w: 15, h: 70, mat: MAT.DOOR },       // 右门(覆盖右墙下段)
            { x: 1985, y: 475, w: 15, h: 40, mat: MAT.GLASS },      // 左墙玻璃窗(一击即碎救人捷径)
        ],
        fires: [
            { x: 280, y: 500, w: 80, h: 45, mat: MAT.GRASS },
            { x: 530, y: 500, w: 60, h: 45, mat: MAT.GRASS },
            { x: 550, y: 380, w: 60, h: 40, mat: MAT.GRASS },
            { x: 1030, y: 500, w: 60, h: 45, mat: MAT.GRASS },
            { x: 1280, y: 500, w: 80, h: 45, mat: MAT.GRASS },
            { x: 1580, y: 500, w: 60, h: 45, mat: MAT.GRASS },
            { x: 1900, y: 500, w: 80, h: 45, mat: MAT.GRASS },
            { x: 2130, y: 500, w: 60, h: 45, mat: MAT.GRASS },
        ],
        hydrants: [{ x: 80, y: 530 }, { x: 1180, y: 530 }],
        towers: [{ x: 600, y: 300 }],
        equipUnlock: ['hose', 'highpressure', 'foam', 'co2', 'powder', 'heatshield', 'tank', 'scba'],
        victims: [{ x: 900, y: 520 }, { x: 1500, y: 520 }, { x: 2000, y: 520 }],
        sprinklers: [],
        fireSwitches: []
    },
    {
        name: "第七关：火山喷发", subtitle: "岩浆流与极端救援",
        desc: "火山喷发了！滚烫的岩浆从火山口不断涌出，溢下山坡点燃一切可燃物。只有用水把火山口的岩浆全部浇灭凝固，才能堵住喷发口！救出被困的科学家！",
        equipment: "🔧 解锁装备：全部装备（含隔热服/SCBA）", tip: "提示：岩浆温度极高(1200°C)，水接触会迅速气化。爬上火山口边缘向下浇水，把火山口里的岩浆全部冷却成岩石才能堵住喷发口（否则岩浆会一直涌出）。注意火药罐爆炸！",
        playerStart: { x: 60, y: 450 }, worldWidth: 2000, worldHeight: 600,
        structures: [
            { x: 0, y: 570, w: 2000, h: 30, mat: MAT.CONCRETE },
            // 火山锥体(岩石)
            { x: 800, y: 200, w: 400, h: 30, mat: MAT.CONCRETE },   // 火山口底板
            { x: 800, y: 160, w: 50, h: 40, mat: MAT.CONCRETE },    // 左火山口边缘(加高圈住岩浆)
            { x: 1150, y: 160, w: 50, h: 40, mat: MAT.CONCRETE },   // 右火山口边缘(加高圈住岩浆)
            { x: 750, y: 230, w: 60, h: 340, mat: MAT.CONCRETE },   // 左山坡
            { x: 1190, y: 230, w: 60, h: 340, mat: MAT.CONCRETE },  // 右山坡
            { x: 700, y: 400, w: 60, h: 170, mat: MAT.CONCRETE },   // 左山脚
            { x: 1240, y: 400, w: 60, h: 170, mat: MAT.CONCRETE },  // 右山脚
            // 火山口内岩浆池(初始岩浆, 位于两边缘之间)
            { x: 855, y: 175, w: 290, h: 25, mat: MAT.LAVA },
            // 山坡两侧可燃物(树木/草地)
            { x: 400, y: 520, w: 250, h: 25, mat: MAT.GRASS },
            { x: 450, y: 440, w: 20, h: 80, mat: MAT.WOOD },
            { x: 420, y: 400, w: 80, h: 45, mat: MAT.GRASS },
            { x: 1350, y: 520, w: 250, h: 25, mat: MAT.GRASS },
            { x: 1450, y: 440, w: 20, h: 80, mat: MAT.WOOD },
            { x: 1420, y: 400, w: 80, h: 45, mat: MAT.GRASS },
            // === 火山坡外侧FC式攀爬平台+墙梯(改善通行, 不改动火山口几何) ===
            { x: 590, y: 440, w: 110, h: 15, mat: MAT.CONCRETE },   // 左平台1
            { x: 570, y: 440, w: 15, h: 130, mat: MAT.WALL },       // 左墙梯1(地面→左平台1)
            { x: 630, y: 330, w: 110, h: 15, mat: MAT.CONCRETE },   // 左平台2
            { x: 610, y: 330, w: 15, h: 110, mat: MAT.WALL },       // 左墙梯2(左平台1→左平台2)
            { x: 1300, y: 440, w: 110, h: 15, mat: MAT.CONCRETE },  // 右平台1
            { x: 1310, y: 440, w: 15, h: 130, mat: MAT.WALL },      // 右墙梯1(地面→右平台1)
            { x: 1260, y: 330, w: 110, h: 15, mat: MAT.CONCRETE },  // 右平台2
            { x: 1380, y: 330, w: 15, h: 110, mat: MAT.WALL },      // 右墙梯2(右平台1→右平台2)
            // 山脚研究站(木结构)
            { x: 200, y: 450, w: 150, h: 15, mat: MAT.WOOD },
            { x: 200, y: 465, w: 15, h: 105, mat: MAT.WOOD },
            { x: 335, y: 465, w: 15, h: 105, mat: MAT.WOOD },
            { x: 335, y: 485, w: 15, h: 45, mat: MAT.GLASS },       // 研究站玻璃观察窗(破窗救科学家)
            { x: 240, y: 400, w: 20, h: 50, mat: MAT.BRICK },       // 研究站红砖烟囱(FC装饰)
            // 左山脚顶冰块(岩浆热辐射缓慢融化, 流下应急水)
            { x: 705, y: 370, w: 30, h: 30, mat: MAT.ICE },
            // 火药罐(研究站燃料)
            { x: 250, y: 540, w: 30, h: 25, mat: MAT.KEG },
            { x: 1500, y: 540, w: 30, h: 25, mat: MAT.KEG },
            // 右侧岩石屏障
            { x: 1700, y: 480, w: 50, h: 90, mat: MAT.CONCRETE },
            // 右端冰川(火/冰主题对比; 斧破取水的备用水源)
            { x: 1860, y: 460, w: 110, h: 110, mat: MAT.ICE },
        ],
        fires: [
            { x: 420, y: 500, w: 60, h: 40, mat: MAT.GRASS },
            { x: 1380, y: 500, w: 60, h: 40, mat: MAT.GRASS },
        ],
        hydrants: [{ x: 80, y: 530 }, { x: 1800, y: 530 }],
        towers: [{ x: 500, y: 300 }, { x: 1500, y: 300 }],
        // 火山喷发口: 岩浆从火山口缓慢涌出, 只有完全浇灭火山口岩浆(冷却凝固)才能堵住
        lavaVents: [{ x: 1000, y: 195, crater: { x: 845, y: 150, w: 310, h: 55 } }],
        equipUnlock: ['hose', 'highpressure', 'foam', 'co2', 'powder', 'heatshield', 'tank', 'scba'],
        victims: [{ x: 280, y: 520 }, { x: 1600, y: 520 }],
        sprinklers: [],
        fireSwitches: []
    },
    {
        name: "第八关：燃油码头", subtitle: "油浮水面 - 泡沫克星",
        desc: "油罐泄漏，汽油浮在水面上熊熊燃烧！水浇不灭油火（水会沉到油底），必须用泡沫覆盖灭火。先救出被困工人，再用泡沫扑灭水面油火！",
        equipment: "🔧 解锁装备：泡沫喷射器（油火克星）+ CO2灭火器 + 干粉灭火器", tip: "提示：汽油密度比水小，浮在水面燃烧，浇水只会沉底无效！用泡沫（密度更小浮在油面）覆盖灭火。火药粉遇火连锁爆燃，尽快清除！",
        playerStart: { x: 60, y: 520 }, worldWidth: 2000, worldHeight: 600,
        structures: [
            { x: 0, y: 570, w: 2000, h: 30, mat: MAT.CONCRETE },    // 地面
            // === 码头水池 ===
            { x: 480, y: 530, w: 1040, h: 40, mat: MAT.WATER },      // 水池
            // === 木栈桥(水面之上) ===
            { x: 520, y: 460, w: 480, h: 15, mat: MAT.WOOD },        // 栈桥面板
            { x: 540, y: 475, w: 15, h: 95, mat: MAT.WOOD },         // 桥桩(入水)
            { x: 960, y: 475, w: 15, h: 95, mat: MAT.WOOD },         // 桥桩(入水)
            // 红砖阶梯(地面→栈桥)
            { x: 420, y: 530, w: 40, h: 40, mat: MAT.BRICK },
            { x: 460, y: 490, w: 40, h: 80, mat: MAT.BRICK },
            // 栈桥上油罐(KEG, 受热爆炸危险)
            { x: 600, y: 420, w: 40, h: 40, mat: MAT.KEG },
            { x: 660, y: 420, w: 40, h: 40, mat: MAT.KEG },
            // === 仓库(左侧, 木结构) ===
            { x: 60, y: 380, w: 20, h: 190, mat: MAT.WALL },         // 左墙
            { x: 60, y: 380, w: 260, h: 20, mat: MAT.CONCRETE },     // 屋顶
            { x: 300, y: 380, w: 20, h: 100, mat: MAT.WALL },        // 右墙上段
            { x: 300, y: 530, w: 20, h: 40, mat: MAT.WALL },         // 右墙下段
            { x: 300, y: 480, w: 20, h: 50, mat: MAT.DOOR },         // 仓库木门
            { x: 100, y: 500, w: 60, h: 70, mat: MAT.WOOD },         // 木箱
            { x: 210, y: 520, w: 50, h: 50, mat: MAT.WOOD },         // 木箱
            // === 右侧燃料桶平台 ===
            { x: 1600, y: 480, w: 220, h: 20, mat: MAT.CONCRETE },   // 平台板
            { x: 1600, y: 500, w: 15, h: 70, mat: MAT.WALL },        // 左砖柱
            { x: 1805, y: 500, w: 15, h: 70, mat: MAT.WALL },        // 右砖柱
            { x: 1650, y: 440, w: 50, h: 40, mat: MAT.FUEL },        // 燃料桶
            { x: 1720, y: 440, w: 40, h: 40, mat: MAT.FUEL },        // 燃料桶
            // 火药粉导火索(仓库门口→阶梯, 延烧引信)
            { x: 330, y: 552, w: 80, h: 18, mat: MAT.GUNPOWDER },
        ],
        fires: [
            { x: 580, y: 516, w: 360, h: 14, mat: MAT.GASOLINE },    // 浮油大火(水面, 水浇不灭)
            { x: 120, y: 460, w: 40, h: 40, mat: MAT.PAPER },        // 仓库内
            { x: 1660, y: 400, w: 40, h: 40, mat: MAT.PAPER },       // 右平台
        ],
        hydrants: [{ x: 100, y: 530 }, { x: 1900, y: 530 }],
        towers: [{ x: 1150, y: 300 }],
        equipUnlock: ['hose', 'highpressure', 'foam', 'co2', 'powder'],
        victims: [{ x: 820, y: 420 }, { x: 180, y: 530 }],
        sprinklers: [], fireSwitches: []
    },
    {
        name: "第九关：摩天大厦", subtitle: "混凝土森林与玻璃幕墙",
        desc: "一栋超高层混凝土摩天楼起火！混凝土本身不燃但会导热，办公可燃物和屋顶沥青年正在燃烧。某层还铺了火药粉导火索，一旦引燃将连锁爆燃！攀上电梯井逐层扑救！",
        equipment: "🔧 全部装备已解锁（含隔热服/SCBA）", tip: "提示：混凝土不燃但导热，火会烤热楼板引燃上层。屋顶沥青难点燃但燃烧持久温度高。火药粉导火索连锁极快，优先扑灭或斧头清除。玻璃幕墙斧头一击即碎",
        playerStart: { x: 60, y: 1700 }, worldWidth: 1400, worldHeight: 1800,
        structures: [
            { x: 0, y: 1770, w: 1400, h: 30, mat: MAT.CONCRETE },    // 地面
            // === 摩天楼: 11层等间距楼板 + 贯穿电梯井 + 玻璃幕墙 + 屋顶沥青 ===
            { x: 300, y: 250, w: 25, h: 1420, mat: MAT.CONCRETE },   // 左外墙(y1670下为入口开间)
            { x: 975, y: 250, w: 25, h: 1520, mat: MAT.CONCRETE },   // 右外墙
            { x: 300, y: 250, w: 460, h: 25, mat: MAT.CONCRETE },    // 屋顶左段
            { x: 880, y: 250, w: 120, h: 25, mat: MAT.CONCRETE },    // 屋顶右段
            { x: 740, y: 250, w: 25, h: 1450, mat: MAT.CONCRETE },   // 电梯井墙梯(y1700下留门洞, 全高可攀爬)
            // 楼板(左段x325-740 + 右走廊x875-975, x765-875为电梯井空腔)
            { x: 325, y: 390, w: 415, h: 20, mat: MAT.CONCRETE },
            { x: 875, y: 390, w: 100, h: 20, mat: MAT.CONCRETE },
            { x: 325, y: 530, w: 415, h: 20, mat: MAT.CONCRETE },
            { x: 875, y: 530, w: 100, h: 20, mat: MAT.CONCRETE },
            { x: 325, y: 670, w: 415, h: 20, mat: MAT.CONCRETE },
            { x: 875, y: 670, w: 100, h: 20, mat: MAT.CONCRETE },
            { x: 325, y: 810, w: 415, h: 20, mat: MAT.CONCRETE },
            { x: 875, y: 810, w: 100, h: 20, mat: MAT.CONCRETE },
            { x: 325, y: 950, w: 415, h: 20, mat: MAT.CONCRETE },
            { x: 875, y: 950, w: 100, h: 20, mat: MAT.CONCRETE },
            { x: 325, y: 1090, w: 415, h: 20, mat: MAT.CONCRETE },
            { x: 875, y: 1090, w: 100, h: 20, mat: MAT.CONCRETE },
            { x: 325, y: 1230, w: 415, h: 20, mat: MAT.CONCRETE },
            { x: 875, y: 1230, w: 100, h: 20, mat: MAT.CONCRETE },
            { x: 325, y: 1370, w: 415, h: 20, mat: MAT.CONCRETE },
            { x: 875, y: 1370, w: 100, h: 20, mat: MAT.CONCRETE },
            { x: 325, y: 1510, w: 415, h: 20, mat: MAT.CONCRETE },
            { x: 875, y: 1510, w: 100, h: 20, mat: MAT.CONCRETE },
            { x: 325, y: 1650, w: 415, h: 20, mat: MAT.CONCRETE },
            { x: 875, y: 1650, w: 100, h: 20, mat: MAT.CONCRETE },
            // 屋顶沥青(可燃屋面, 难点燃但燃烧持久温度高)
            { x: 380, y: 225, w: 250, h: 25, mat: MAT.TAR },
            // 玻璃幕墙(覆盖外墙; FC破窗入楼, 斧头一击即碎)
            { x: 300, y: 1560, w: 25, h: 80, mat: MAT.GLASS },       // 2层左窗
            { x: 300, y: 1280, w: 25, h: 80, mat: MAT.GLASS },       // 4层左窗
            { x: 300, y: 1000, w: 25, h: 80, mat: MAT.GLASS },       // 6层左窗
            { x: 300, y: 720, w: 25, h: 80, mat: MAT.GLASS },        // 8层左窗
            { x: 300, y: 440, w: 25, h: 80, mat: MAT.GLASS },        // 10层左窗
            { x: 975, y: 1420, w: 25, h: 80, mat: MAT.GLASS },       // 3层右窗
            { x: 975, y: 1140, w: 25, h: 80, mat: MAT.GLASS },       // 5层右窗
            { x: 975, y: 860, w: 25, h: 80, mat: MAT.GLASS },        // 7层右窗
            { x: 975, y: 580, w: 25, h: 80, mat: MAT.GLASS },        // 9层右窗
            // 火药粉导火索(6层, 连锁爆燃)
            { x: 350, y: 1072, w: 200, h: 18, mat: MAT.GUNPOWDER },
            // 室内木家具(可燃物)
            { x: 380, y: 1620, w: 80, h: 30, mat: MAT.WOOD },        // 1层木桌
            { x: 500, y: 1340, w: 70, h: 30, mat: MAT.WOOD },        // 3层木桌
            { x: 560, y: 1060, w: 60, h: 30, mat: MAT.WOOD },        // 6层木桌(导火索末端)
            { x: 420, y: 780, w: 80, h: 30, mat: MAT.WOOD },         // 8层木桌
            { x: 550, y: 500, w: 70, h: 30, mat: MAT.WOOD },         // 10层木桌
            // 屋顶红砖女儿墙 + 冰水箱(应急水源)
            { x: 320, y: 215, w: 15, h: 35, mat: MAT.BRICK },
            { x: 700, y: 215, w: 15, h: 35, mat: MAT.BRICK },
            { x: 500, y: 185, w: 60, h: 60, mat: MAT.ICE },
        ],
        fires: [
            { x: 400, y: 1610, w: 60, h: 40, mat: MAT.WOOD },        // 1层
            { x: 520, y: 1330, w: 50, h: 40, mat: MAT.PAPER },       // 3层
            { x: 350, y: 1072, w: 30, h: 18, mat: MAT.GUNPOWDER },   // 6层导火索点火端
            { x: 450, y: 770, w: 60, h: 40, mat: MAT.FUEL },         // 8层
            { x: 560, y: 490, w: 50, h: 40, mat: MAT.WOOD },         // 10层
            { x: 400, y: 225, w: 80, h: 25, mat: MAT.TAR },          // 屋顶沥青
        ],
        hydrants: [{ x: 80, y: 1730 }, { x: 1300, y: 1730 }],
        towers: [{ x: 820, y: 180 }],
        equipUnlock: ['hose', 'highpressure', 'foam', 'co2', 'powder', 'heatshield', 'tank', 'scba'],
        victims: [{ x: 650, y: 1330 }, { x: 600, y: 770 }, { x: 680, y: 1610 }],
        sprinklers: [{ x: 520, y: 1375 }, { x: 630, y: 955 }, { x: 580, y: 535 }],
        fireSwitches: [{ x: 100, y: 1730 }]
    },
    {
        name: "第十关：火山天文台", subtitle: "岩浆、油库与终极救援",
        desc: "火山猛烈喷发，岩浆顺坡流下，点燃了山脚的汽油库和天文台！汽油浮在水面燃烧水浇不灭，岩浆温度高达1200°C。先浇灭火山口岩浆堵住喷发，再用泡沫扑灭油火，救出被困的科学家！",
        equipment: "🔧 全部装备已解锁（含隔热服/SCBA）", tip: "提示：岩浆持续涌出，必须先爬上火山口浇水凝固岩浆堵住喷发口。汽油库着火水浇不灭，用泡沫！火药粉遇岩浆连锁爆燃，注意躲避",
        playerStart: { x: 60, y: 550 }, worldWidth: 2200, worldHeight: 700,
        structures: [
            { x: 0, y: 670, w: 2200, h: 30, mat: MAT.CONCRETE },     // 地面
            // === 火山锥体(岩石) ===
            { x: 1050, y: 250, w: 400, h: 30, mat: MAT.CONCRETE },   // 火山口底板
            { x: 1050, y: 210, w: 50, h: 40, mat: MAT.CONCRETE },    // 左火山口边缘
            { x: 1400, y: 210, w: 50, h: 40, mat: MAT.CONCRETE },    // 右火山口边缘
            { x: 1000, y: 280, w: 60, h: 390, mat: MAT.CONCRETE },   // 左山坡
            { x: 1440, y: 280, w: 60, h: 390, mat: MAT.CONCRETE },   // 右山坡
            { x: 950, y: 450, w: 60, h: 220, mat: MAT.CONCRETE },    // 左山脚
            { x: 1490, y: 450, w: 60, h: 220, mat: MAT.CONCRETE },   // 右山脚
            // 火山口内岩浆池(初始岩浆)
            { x: 1105, y: 225, w: 290, h: 25, mat: MAT.LAVA },
            // === 天文台(左侧, 混凝土穹顶+玻璃观察窗) ===
            { x: 200, y: 480, w: 300, h: 20, mat: MAT.CONCRETE },    // 天文台地板
            { x: 200, y: 380, w: 20, h: 100, mat: MAT.CONCRETE },    // 左墙
            { x: 480, y: 380, w: 20, h: 100, mat: MAT.CONCRETE },    // 右墙
            { x: 200, y: 360, w: 300, h: 20, mat: MAT.CONCRETE },    // 穹顶
            { x: 480, y: 420, w: 20, h: 60, mat: MAT.GLASS },        // 玻璃观察窗(破窗救人)
            { x: 250, y: 440, w: 80, h: 40, mat: MAT.METAL },        // 望远镜基座(金属)
            // === 汽油库(右侧, 浮水燃烧) ===
            { x: 1600, y: 630, w: 400, h: 40, mat: MAT.WATER },      // 库区水池
            // 火药粉(科研爆破品)
            { x: 600, y: 652, w: 150, h: 18, mat: MAT.GUNPOWDER },
            // 山坡可燃物(草地/树木)
            { x: 700, y: 620, w: 250, h: 25, mat: MAT.GRASS },
            { x: 1600, y: 550, w: 20, h: 80, mat: MAT.WOOD },
            // === 火山坡外侧FC式攀爬平台+墙梯 ===
            { x: 840, y: 500, w: 110, h: 15, mat: MAT.CONCRETE },    // 左平台1
            { x: 820, y: 500, w: 15, h: 170, mat: MAT.WALL },        // 左墙梯1
            { x: 880, y: 380, w: 110, h: 15, mat: MAT.CONCRETE },    // 左平台2
            { x: 860, y: 380, w: 15, h: 120, mat: MAT.WALL },        // 左墙梯2
            { x: 1560, y: 500, w: 110, h: 15, mat: MAT.CONCRETE },   // 右平台1
            { x: 1655, y: 500, w: 15, h: 170, mat: MAT.WALL },       // 右墙梯1
            // 火药罐(燃料)
            { x: 560, y: 645, w: 30, h: 25, mat: MAT.KEG },
            { x: 1560, y: 640, w: 30, h: 25, mat: MAT.KEG },
            // 冰块(应急水源)
            { x: 955, y: 420, w: 30, h: 30, mat: MAT.ICE },
            { x: 100, y: 620, w: 80, h: 50, mat: MAT.ICE },
        ],
        fires: [
            { x: 1650, y: 616, w: 300, h: 14, mat: MAT.GASOLINE },   // 汽油库大火(浮水, 水浇不灭)
            { x: 720, y: 595, w: 60, h: 25, mat: MAT.GRASS },        // 山坡草地
        ],
        hydrants: [{ x: 80, y: 630 }, { x: 2100, y: 630 }],
        towers: [{ x: 350, y: 300 }, { x: 1850, y: 350 }],
        // 火山喷发口: 岩浆持续涌出, 只有浇灭火山口岩浆(冷却凝固)才能堵住
        lavaVents: [{ x: 1250, y: 245, crater: { x: 1095, y: 200, w: 310, h: 55 } }],
        equipUnlock: ['hose', 'highpressure', 'foam', 'co2', 'powder', 'heatshield', 'tank', 'scba'],
        victims: [{ x: 380, y: 440 }, { x: 2050, y: 630 }, { x: 900, y: 630 }],
        sprinklers: [], fireSwitches: []
    }
];

// ==================== 主游戏类 ====================
class FirefighterGame {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.keys = {};
        this.mouse = { x: 0, y: 0, down: false };
        this.camera = { x: 0, y: 0 };
        this.currentLevel = 0;
        this.score = 0;
        this.state = 'intro'; // intro, playing, complete, gameover
        this.paused = false;
        this.time = 0;
        this.shake = 0; // 屏幕震动强度(斧头命中/破坏时触发)

        // 通用粒子系统(蒸汽/烟雾/火星/碎屑统一管理)
        this.particles = new ParticleSystem(1400);

        // 材质纹理图案(世界空间连续纹理, 钢筋水泥/木板/金属/砖墙/门等细节)
        this.texturePatterns = {};
        this.initTextures();

        // 消防员像素画精灵(3帧行走动画, 2x放大锐利像素风)
        this.initPlayerSprites();

        this.grid = null;
        this.player = null;
        this.hydrants = [];
        this.towers = [];
        this.fireSwitches = [];  // 消防开关(切换喷淋系统)
        this.sprinklers = [];    // 烟雾探测灭火头(天花板喷淋)
        this.victims = [];       // 待救受害者(救人模式)
        this.lavaVents = [];     // 火山喷发口(岩浆涌出, 浇灭火山口可堵住)
        this.initialFireCount = 1;
        this.liveEmbers = [];  // 飞火火星(带物理飞行, 落地点燃可燃物)
        this.droplets = [];    // 喷射水滴(惯性抛物线飞行, 撞墙沉积)
        this.towerRefillFx = null;      // 水塔补水浮动提示({x,y,t,amount})
        this.unlockedWeapons = ['hose']; // 过关累积解锁的武器(跨关卡保留, 新周目重置)

        this.initInput();
        this.showLevelIntro(0);
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    resize() {
        this.canvas.width = Math.min(1200, window.innerWidth);
        this.canvas.height = Math.min(650, window.innerHeight - 20);
    }

    // ==================== 材质纹理系统(世界空间连续纹理, 消除单色平块的粗糙感) ====================
    // 确定性伪随机(保证纹理每次加载一致)
    texRand(seed) {
        let s = seed;
        return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    }

    initTextures() {
        const ctx = this.ctx;
        const TILE = 80; // 纹理瓦片尺寸(16格x16格 @5px, 足够大减少重复感)
        const makers = {
            [MAT.CONCRETE]: () => this.texConcrete(TILE),
            [MAT.WOOD]: () => this.texWood(TILE),
            [MAT.METAL]: () => this.texMetal(TILE),
            [MAT.WALL]: () => this.texBrick(TILE),
            [MAT.PAPER]: () => this.texPaper(TILE),
            [MAT.FUEL]: () => this.texFuel(TILE),
            [MAT.CHAR]: () => this.texChar(TILE),
            [MAT.DOOR]: () => this.texDoor(TILE),
            [MAT.KEG]: () => this.texKeg(TILE),
            [MAT.GRASS]: () => this.texGrass(TILE),
            [MAT.ICE]: () => this.texIce(TILE),
            [MAT.GLASS]: () => this.texGlass(TILE),
            [MAT.BRICK]: () => this.texBrickRed(TILE)
        };
        for (const key in makers) {
            const tile = makers[key]();
            this.texturePatterns[key] = ctx.createPattern(tile, 'repeat');
        }
    }

    // 冰块: 淡蓝冰面+深浅蓝斑+白色裂纹+高光斜纹(受热融化成水)
    texIce(size) {
        const c = this.texCanvas(size), g = c.getContext('2d'), rnd = this.texRand(6161);
        g.fillStyle = '#9fd4ee'; g.fillRect(0, 0, size, size);
        // 冰层色块(深浅蓝斑)
        for (let i = 0; i < 40; i++) {
            g.fillStyle = rnd() > 0.5 ? '#b8e2f6' : '#8ac4e4';
            g.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), 4 + Math.floor(rnd() * 10), 3 + Math.floor(rnd() * 6));
        }
        // 裂纹(白色折线)
        g.strokeStyle = 'rgba(240,250,255,0.7)'; g.lineWidth = 1;
        for (let k = 0; k < 5; k++) {
            let x = rnd() * size, y = rnd() * size;
            g.beginPath(); g.moveTo(x, y);
            for (let s = 0; s < 4; s++) { x += (rnd() - 0.5) * 24; y += (rnd() - 0.5) * 24; g.lineTo(x, y); }
            g.stroke();
        }
        // 高光斜纹
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
        for (let d = -size; d < size * 2; d += 22) { g.beginPath(); g.moveTo(d, 0); g.lineTo(d + size / 2, size); g.stroke(); }
        return c;
    }

    // 玻璃: 半透明淡青+斜向高光带+窗棂分格(斧头一击即碎; 半透明透出背景)
    texGlass(size) {
        const c = this.texCanvas(size), g = c.getContext('2d');
        g.fillStyle = 'rgba(150,210,235,0.30)'; g.fillRect(0, 0, size, size);
        // 斜向高光带
        g.strokeStyle = 'rgba(255,255,255,0.30)'; g.lineWidth = 4;
        for (let d = -size; d < size * 2; d += 26) { g.beginPath(); g.moveTo(d, size); g.lineTo(d + size * 0.6, 0); g.stroke(); }
        // 窗棂(浅色分格线)
        g.strokeStyle = 'rgba(200,230,245,0.5)'; g.lineWidth = 1;
        for (let x = 0; x <= size; x += 20) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, size); g.stroke(); }
        for (let y = 0; y <= size; y += 20) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(size, y + 0.5); g.stroke(); }
        return c;
    }

    // 红砖: FC马里奥式亮红砖(错缝+亮度变化, 与深棕砖墙WALL区分)
    texBrickRed(size) {
        const c = this.texCanvas(size), g = c.getContext('2d'), rnd = this.texRand(2333);
        g.fillStyle = '#5a2a20'; g.fillRect(0, 0, size, size); // 砂浆底色
        const bw = 16, bh = 8;
        for (let row = 0; row * bh < size; row++) {
            const offset = (row % 2) * (bw / 2);
            for (let col = -1; col * bw < size + bw; col++) {
                const x = col * bw + offset, y = row * bh;
                const v = Math.floor(rnd() * 26) - 13;
                g.fillStyle = `rgb(${178 + v},${62 + v},${40 + v})`;
                g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
            }
        }
        return c;
    }

    // 创建纹理瓦片画布
    texCanvas(size) {
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        return c;
    }

    // 钢筋水泥: 灰调基底+斑点噪点+钢筋线(带锈迹)+裂纹
    texConcrete(size) {
        const c = this.texCanvas(size), g = c.getContext('2d'), rnd = this.texRand(12345);
        g.fillStyle = '#4a4a58'; g.fillRect(0, 0, size, size);
        // 噪点斑点(深浅交错)
        for (let i = 0; i < 260; i++) {
            const v = rnd() > 0.5 ? 14 : -14;
            g.fillStyle = `rgb(${74 + v},${74 + v},${88 + v})`;
            g.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), rnd() > 0.7 ? 2 : 1, 1);
        }
        // 横向钢筋(深灰线+锈点)
        for (let y = 12; y < size; y += 26) {
            g.fillStyle = '#3a3a46'; g.fillRect(0, y, size, 2);
            g.fillStyle = '#6a4a3a';
            for (let x = 0; x < size; x += 9) if (rnd() > 0.5) g.fillRect(x + Math.floor(rnd() * 5), y, 3, 2);
        }
        // 纵向钢筋(较稀疏)
        for (let x = 20; x < size; x += 34) {
            g.fillStyle = '#3c3c48'; g.fillRect(x, 0, 2, size);
        }
        // 裂纹(锅齿暗线)
        g.strokeStyle = '#383842'; g.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
            g.beginPath();
            let x = Math.floor(rnd() * size), y = Math.floor(rnd() * size);
            g.moveTo(x, y);
            for (let s = 0; s < 5; s++) { x += Math.floor(rnd() * 10) - 5; y += Math.floor(rnd() * 8); g.lineTo(x, y); }
            g.stroke();
        }
        return c;
    }

    // 木板: 棕色木板+木纹+板缝+钉子+节疤
    texWood(size) {
        const c = this.texCanvas(size), g = c.getContext('2d'), rnd = this.texRand(777);
        g.fillStyle = '#8B6914'; g.fillRect(0, 0, size, size);
        // 水平木板(每16px一块, 板缝深色)
        for (let py = 0; py < size; py += 16) {
            // 木纹(水平波浪细线)
            for (let l = 0; l < 5; l++) {
                g.strokeStyle = rnd() > 0.5 ? '#7a5a10' : '#9a781c';
                g.lineWidth = 1;
                g.beginPath();
                let y = py + 2 + Math.floor(rnd() * 12);
                g.moveTo(0, y);
                for (let x = 0; x <= size; x += 10) g.lineTo(x, y + Math.floor(rnd() * 3) - 1);
                g.stroke();
            }
            // 板缝
            g.fillStyle = '#5a4210'; g.fillRect(0, py + 15, size, 1);
            // 钉子(板两端)
            g.fillStyle = '#4a3a20';
            g.fillRect(3, py + 7, 2, 2); g.fillRect(size - 5, py + 7, 2, 2);
        }
        // 节疤(少量椭圆暗斑)
        for (let k = 0; k < 3; k++) {
            g.fillStyle = '#6a4e0e';
            g.beginPath();
            g.ellipse(Math.floor(rnd() * size), Math.floor(rnd() * size), 3, 2, 0, 0, Math.PI * 2);
            g.fill();
        }
        return c;
    }

    // 金属: 灰调面板+铆钉+拉缝+高光+划痕
    texMetal(size) {
        const c = this.texCanvas(size), g = c.getContext('2d'), rnd = this.texRand(4242);
        g.fillStyle = '#6a6a7a'; g.fillRect(0, 0, size, size);
        // 面板网格(每20px一块, 暗色边框)
        g.strokeStyle = '#565666'; g.lineWidth = 1;
        for (let x = 0; x <= size; x += 20) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, size); g.stroke(); }
        for (let y = 0; y <= size; y += 20) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(size, y + 0.5); g.stroke(); }
        // 铆钉(面板四角亮点)
        for (let x = 0; x < size; x += 20) for (let y = 0; y < size; y += 20) {
            g.fillStyle = '#8a8a9a'; g.fillRect(x + 3, y + 3, 2, 2);
            g.fillStyle = '#4a4a5a'; g.fillRect(x + 3, y + 4, 2, 1);
        }
        // 顶部高光条(金属反光)
        g.fillStyle = 'rgba(200,200,220,0.18)';
        for (let y = 0; y < size; y += 20) g.fillRect(0, y + 1, size, 2);
        // 划痕(浅色细线)
        g.strokeStyle = 'rgba(190,190,210,0.35)'; g.lineWidth = 1;
        for (let k = 0; k < 4; k++) {
            g.beginPath();
            const x = Math.floor(rnd() * size), y = Math.floor(rnd() * size);
            g.moveTo(x, y); g.lineTo(x + Math.floor(rnd() * 14) - 7, y + Math.floor(rnd() * 14) - 7);
            g.stroke();
        }
        return c;
    }

    // 砖墙: 错缝砖块+砂浆缝+砖色变化
    texBrick(size) {
        const c = this.texCanvas(size), g = c.getContext('2d'), rnd = this.texRand(999);
        g.fillStyle = '#4a3a30'; g.fillRect(0, 0, size, size); // 砂浆底色
        const bw = 16, bh = 8; // 砖块尺寸(砂浆缝1px)
        for (let row = 0; row * bh < size; row++) {
            const offset = (row % 2) * (bw / 2); // 错缝
            for (let col = -1; col * bw < size + bw; col++) {
                const x = col * bw + offset, y = row * bh;
                const v = Math.floor(rnd() * 24) - 12;
                g.fillStyle = `rgb(${138 + v},${90 + v},${74 + v})`; // 红棕砖
                g.fillRect(x, y, bw - 1, bh - 1);
                // 砖面高光(左上)
                g.fillStyle = 'rgba(255,220,200,0.12)';
                g.fillRect(x, y, bw - 1, 1);
            }
        }
        return c;
    }

    // 纸张: 浅调+横纹+噪点
    texPaper(size) {
        const c = this.texCanvas(size), g = c.getContext('2d'), rnd = this.texRand(555);
        g.fillStyle = '#d4c5a0'; g.fillRect(0, 0, size, size);
        g.fillStyle = '#c4b590';
        for (let y = 4; y < size; y += 7) g.fillRect(0, y, size, 1);
        for (let i = 0; i < 60; i++) {
            g.fillStyle = rnd() > 0.5 ? '#cabb96' : '#ded0ab';
            g.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), 1, 1);
        }
        return c;
    }

    // 燃料桶: 红色桶身+黄色警示条+黑斜纹
    texFuel(size) {
        const c = this.texCanvas(size), g = c.getContext('2d');
        g.fillStyle = '#8b0000'; g.fillRect(0, 0, size, size);
        // 黄色警示条(中部)
        g.fillStyle = '#e8b800'; g.fillRect(0, size / 2 - 6, size, 12);
        // 黑色斜纹(警示条上)
        g.fillStyle = '#1a1a1a';
        for (let x = -12; x < size; x += 12) {
            g.beginPath();
            g.moveTo(x, size / 2 - 6); g.lineTo(x + 6, size / 2 - 6);
            g.lineTo(x + 18, size / 2 + 6); g.lineTo(x + 12, size / 2 + 6);
            g.closePath(); g.fill();
        }
        // 桶身拉缝(上下暗线)
        g.fillStyle = '#6a0000';
        g.fillRect(0, 8, size, 2); g.fillRect(0, size - 10, size, 2);
        // 高光(左侧反光)
        g.fillStyle = 'rgba(255,120,120,0.25)';
        for (let y = 0; y < size; y += 20) g.fillRect(2, y, 3, 18);
        return c;
    }

    // 焦炭: 深黑+裂纹+余烬光点
    texChar(size) {
        const c = this.texCanvas(size), g = c.getContext('2d'), rnd = this.texRand(31337);
        g.fillStyle = '#1a1008'; g.fillRect(0, 0, size, size);
        // 裂纹(深黑锅齿线)
        g.strokeStyle = '#0a0804'; g.lineWidth = 1;
        for (let k = 0; k < 8; k++) {
            g.beginPath();
            let x = Math.floor(rnd() * size), y = Math.floor(rnd() * size);
            g.moveTo(x, y);
            for (let s = 0; s < 4; s++) { x += Math.floor(rnd() * 12) - 6; y += Math.floor(rnd() * 12) - 6; g.lineTo(x, y); }
            g.stroke();
        }
        // 灰色烧尽斑点
        for (let i = 0; i < 40; i++) {
            g.fillStyle = '#2a2018';
            g.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), 2, 1);
        }
        // 余烬光点(橙红)
        for (let i = 0; i < 6; i++) {
            g.fillStyle = rnd() > 0.5 ? '#c44800' : '#8a3000';
            g.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), 2, 2);
        }
        return c;
    }

    // 门: 木板门+门框+双面板+门把手
    texDoor(size) {
        const c = this.texCanvas(size), g = c.getContext('2d'), rnd = this.texRand(8080);
        g.fillStyle = '#7a5230'; g.fillRect(0, 0, size, size);
        // 门框(边缘深色)
        g.fillStyle = '#5a3a20';
        g.fillRect(0, 0, 3, size); g.fillRect(size - 3, 0, 3, size);
        g.fillRect(0, 0, size, 3); g.fillRect(0, size - 3, size, 3);
        // 双面板(内凹暗色矩形+高光边)
        const panels = [[8, 8, size - 16, size / 2 - 14], [8, size / 2 + 6, size - 16, size / 2 - 14]];
        for (const [px, py, pw, ph] of panels) {
            g.fillStyle = '#6a4528'; g.fillRect(px, py, pw, ph);
            g.fillStyle = '#5a3a20'; g.fillRect(px, py, pw, 2); g.fillRect(px, py, 2, ph);
            g.fillStyle = '#8a6238'; g.fillRect(px, py + ph - 2, pw, 2); g.fillRect(px + pw - 2, py, 2, ph);
            // 面板木纹
            g.strokeStyle = '#5f3e24'; g.lineWidth = 1;
            for (let l = 0; l < 3; l++) {
                g.beginPath();
                const y = py + 4 + Math.floor(rnd() * (ph - 8));
                g.moveTo(px + 3, y); g.lineTo(px + pw - 3, y + Math.floor(rnd() * 3) - 1);
                g.stroke();
            }
        }
        // 门把手(右侧黄色圆点)
        g.fillStyle = '#e8c040';
        g.beginPath(); g.arc(size - 10, size / 2, 3, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#b89020';
        g.beginPath(); g.arc(size - 10, size / 2 + 1, 2, 0, Math.PI * 2); g.fill();
        return c;
    }

    // 火药罐: 深灰金属罐+黄色爆炸警示标+铆钉
    texKeg(size) {
        const c = this.texCanvas(size), g = c.getContext('2d');
        g.fillStyle = '#3a3a3a'; g.fillRect(0, 0, size, size);
        // 金属高光(竖向)
        g.fillStyle = 'rgba(180,180,190,0.25)';
        for (let x = 4; x < size; x += 20) g.fillRect(x, 0, 4, size);
        // 黄色爆炸警示条(中部)
        g.fillStyle = '#e8b800'; g.fillRect(0, size / 2 - 8, size, 16);
        // 黑色爆炸标志(闪电状)
        g.fillStyle = '#1a1a1a';
        for (let x = 6; x < size; x += 24) {
            g.beginPath();
            g.moveTo(x, size / 2 - 6); g.lineTo(x + 6, size / 2 - 6);
            g.lineTo(x + 2, size / 2); g.lineTo(x + 8, size / 2);
            g.lineTo(x - 1, size / 2 + 7); g.lineTo(x + 3, size / 2 - 1);
            g.lineTo(x - 2, size / 2 - 1); g.closePath(); g.fill();
        }
        // 上下罐箍(暗色环)
        g.fillStyle = '#2a2a2a';
        g.fillRect(0, 6, size, 3); g.fillRect(0, size - 9, size, 3);
        return c;
    }

    // 草: 绿色植被+草叶纹理+深色阴影
    texGrass(size) {
        const c = this.texCanvas(size), g = c.getContext('2d'), rnd = this.texRand(2024);
        g.fillStyle = '#3a7a2a'; g.fillRect(0, 0, size, size);
        // 草叶(深浅绿竖线)
        for (let i = 0; i < 200; i++) {
            const x = Math.floor(rnd() * size), y = Math.floor(rnd() * size);
            const h = 2 + Math.floor(rnd() * 4);
            g.fillStyle = rnd() > 0.5 ? '#4a9a36' : '#2e6620';
            g.fillRect(x, y, 1, h);
        }
        // 深色阴影斑(草丛层次)
        for (let i = 0; i < 30; i++) {
            g.fillStyle = '#245018';
            g.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), 3, 2);
        }
        // 少量小花/亮点
        for (let i = 0; i < 8; i++) {
            g.fillStyle = rnd() > 0.5 ? '#e8d84a' : '#d8e8d0';
            g.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), 2, 2);
        }
        return c;
    }

    // ==================== 消防员像素画精灵(字符串地图 -> 2x放大画布) ====================
    initPlayerSprites() {
        const PAL = {
            'Y': '#f7b32b', 'y': '#d99a1f', 'D': '#23233a', 'V': '#4a5a8a',
            'R': '#d63a3a', 'r': '#b02a2a', 'S': '#ffd94a', 'K': '#3a3a52',
            'B': '#26262e', 'G': '#7a7a8c', 'g': '#5c5c6e', 'H': '#d9a030'
        };
        // 上半身(头盔+SCBA面罩+反光条消防服+呼吸器钢瓶), 14x18
        const body = [
            '....YYYYYY....',
            '...YYYYYYYY...',
            '..YYYYYYYYYY..',
            '..yyyyyyyyyy..',
            '...DDDDDDDD...',
            '...DVVVVVVD...',
            '...DDDDDDDD...',
            '....DDDDDD....',
            '..RRRRRRRRRR..',
            '.GRRRRRRRRRRR.',
            '.GRRSSSSSSRRR.',
            '.GRRRRRRRRRRR.',
            '.gRRRRRRRRRRH.',
            '..RRRRRRRRRR..',
            '..SSSSSSSSSS..',
            '..RRRRRRRRRR..',
            '..rRRRRRRRRr..',
            '...KKKKKKKK...'
        ];
        // 腿部三帧(并拢/迈开/交叉) -> 行走循环
        const legs = [
            ['...KK....KK...', '...KK....KK...', '...KK....KK...', '...KK....KK...', '..BBB....BBB..', '..BBB....BBB..'],
            ['..KK......KK..', '..KK......KK..', '..KK......KK..', '.KK........KK.', '.BBB......BBB.', '.BBB......BBB.'],
            ['....KK..KK....', '....KK..KK....', '....KK..KK....', '....KK..KK....', '...BBB.BBB....', '...BBB.BBB....']
        ];
        this.playerSprites = legs.map(legRows => {
            const rows = body.concat(legRows);
            const c = document.createElement('canvas');
            c.width = 14 * 2; c.height = 24 * 2;
            const g = c.getContext('2d');
            for (let ry = 0; ry < rows.length; ry++) {
                for (let rx = 0; rx < rows[ry].length; rx++) {
                    const ch = rows[ry][rx];
                    if (ch === '.' || !PAL[ch]) continue;
                    g.fillStyle = PAL[ch];
                    g.fillRect(rx * 2, ry * 2, 2, 2);
                }
            }
            return c;
        });
    }

    initInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            if (e.key.toLowerCase() === 'r') this.cycleEquipment();
            if (e.key.toLowerCase() === 'e') this.interact();
            // 数字键1-5直选武器
            if (e.key >= '1' && e.key <= '5') this.selectWeapon(+e.key - 1);
            if (e.key === ' ') { this.paused = !this.paused; e.preventDefault(); }
        });
        window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
        this.canvas.addEventListener('mousemove', (e) => {
            const r = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - r.left;
            this.mouse.y = e.clientY - r.top;
        });
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.mouse.down = true;
            if (e.button === 2) this.performAxeAttack();
        });
        this.canvas.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    showLevelIntro(idx) {
        const level = LEVELS[idx];
        this.state = 'intro';
        document.getElementById('intro-subtitle').textContent = level.name;
        document.getElementById('intro-desc').textContent = level.desc;
        document.getElementById('intro-equip').textContent = level.equipment;
        document.getElementById('intro-tip').textContent = level.tip;
        document.getElementById('level-intro').classList.remove('hidden');
        document.getElementById('start-btn').onclick = () => {
            document.getElementById('level-intro').classList.add('hidden');
            this.startLevel(idx);
        };
    }

    startLevel(idx) {
        const level = LEVELS[idx];
        this.currentLevel = idx;
        this.state = 'playing';
        this.paused = false;

        // 创建网格
        this.grid = new GridSimulation(level.worldWidth, level.worldHeight, 5);

        // 放置建筑结构
        for (const s of level.structures) {
            this.grid.setRect(s.x, s.y, s.w, s.h, s.mat);
        }
        // 放置可燃物并点火
        for (const f of level.fires) {
            this.grid.setRect(f.x, f.y, f.w, f.h, f.mat);
            this.grid.igniteRect(f.x, f.y, f.w, f.h);
        }

        // 统计初始火焰
        let fc = 0;
        for (let i = 0; i < this.grid.fire.length; i++) if (this.grid.fire[i] > 0.05) fc++;
        this.initialFireCount = Math.max(1, fc);

        // 玩家
        this.player = new Firefighter(level.playerStart.x, level.playerStart.y);
        // 装备 = 本关解锁 ∪ 过关累积解锁的武器(每过一关升级副武器, 跨关卡保留; 被动装备仍按关卡)
        this.player.equipment = [...new Set([...level.equipUnlock, ...this.unlockedWeapons])];
        this.player.currentEquip = 0;
        if (level.equipUnlock.includes('tank')) { this.player.maxWater = 200; this.player.water = 200; }
        // 被动装备(自动生效): 隔热服提升体温阈值+减缓升温, SCBA空气呼吸器大幅减缓氧气消耗
        if (level.equipUnlock.includes('heatshield')) { this.player.heatShield = true; this.player.tempMax = 55; }
        if (level.equipUnlock.includes('scba')) this.player.hasSCBA = true;

        // 消防设施
        this.hydrants = (level.hydrants || []).map(h => ({ x: h.x, y: h.y, active: false, timer: 0 }));
        this.towers = (level.towers || []).map(t => ({ x: t.x, y: t.y, water: 1000, maxWater: 1000, open: false }));
        // 水塔固体结构(罐体金属+支腿落地): 锚点(t.x,t.y)=罐体中心, 罐80x64, 支腿从罐底延伸到地面(worldH-30), 可行走/碰撞/挡水
        for (const t of this.towers) {
            this.grid.setRect(t.x - 40, t.y - 32, 80, 64, MAT.METAL);
            const legH = (this.grid.worldH - 30) - (t.y + 32);
            if (legH > 0) {
                this.grid.setRect(t.x - 38, t.y + 32, 10, legH, MAT.METAL);
                this.grid.setRect(t.x + 28, t.y + 32, 10, legH, MAT.METAL);
            }
        }
        this.fireSwitches = (level.fireSwitches || []).map(s => ({ x: s.x, y: s.y, on: false }));
        this.sprinklers = (level.sprinklers || []).map(s => ({ x: s.x, y: s.y }));
        this.victims = (level.victims || []).map(v => ({ x: v.x, y: v.y, w: 22, h: 40, rescued: false, carried: false, dead: false, hp: 100 }));
        this.lavaVents = (level.lavaVents || []).map(v => ({ x: v.x, y: v.y, crater: v.crater, active: true, timer: 0, clearTimer: 0 }));
        // 预热火山口结构: 火山口周围岩石已被岩浆烤热(1000°C), 不再快速抽取岩浆热量,
        // 岩浆池得以长期维持并持续喷发(否则岩浆会被冷底板快速凝固, 火山几秒就自灭)
        for (const v of this.lavaVents) {
            const c = v.crater, pm = 30;
            this.grid.preheatSolids(c.x - pm, c.y - pm, c.w + pm * 2, c.h + pm * 2, 1000);
        }

        // 清空粒子
        this.particles.clear();

        document.getElementById('hud-level').textContent = idx + 1;
    }

    // R循环切换武器(仅在已解锁武器中循环, 被动装备不参与)
    cycleEquipment() {
        if (!this.player) return;
        const w = this.player.weapons;
        if (w.length === 0) return;
        this.player.currentEquip = (this.player.currentEquip + 1) % w.length;
        this.updateEquipHUD();
    }

    // 数字键1-5直选武器
    selectWeapon(idx) {
        if (!this.player) return;
        const w = this.player.weapons;
        if (idx >= 0 && idx < w.length) {
            this.player.currentEquip = idx;
            this.updateEquipHUD();
        }
    }

    updateEquipHUD() {
        document.getElementById('hud-equip').textContent = EQUIP_NAMES[this.player.currentEquipment] || '水管';
    }

    interact() {
        if (!this.player || this.state !== 'playing') return;
        const px = this.player.x + this.player.w / 2;
        const py = this.player.y + this.player.h / 2;
        // 水塔: 消防员为其补水(把玩家水箱的水灌入水塔, 供喷淋系统使用);
        // 纵向判定放宽到340px, 站在地面/爬塔均可补水; 水塔满或玩家无水则无效
        for (const t of this.towers) {
            if (Math.abs(px - t.x) < 100 && Math.abs(py - t.y) < 340) {
                const space = t.maxWater - t.water;
                if (space > 0 && this.player.water > 0) {
                    const transfer = Math.min(this.player.water, space);
                    this.player.water -= transfer;
                    t.water += transfer;
                    this.towerRefillFx = { x: t.x, y: t.y, t: 0.8, amount: Math.round(transfer) };
                }
                return;
            }
        }
        // 消防开关: 切换烟雾探测灭火头喷淋系统(喷水消耗水塔水量)
        for (const s of this.fireSwitches) {
            if (Math.abs(px - s.x) < 50 && Math.abs(py - s.y) < 60) {
                s.on = !s.on;
                return;
            }
        }
    }

    // ==================== 消防斧头攻击 ====================
    performAxeAttack() {
        if (this.state !== 'playing' || this.paused) return;
        const p = this.player;
        if (!p || p.axeCooldown > 0) return;

        // 计算斧头落点(玩家前方)
        const worldMX = this.mouse.x + this.camera.x;
        const worldMY = this.mouse.y + this.camera.y;
        const sx = p.x + p.w / 2;
        const sy = p.y + p.h * 0.3;
        p.aimAngle = Math.atan2(worldMY - sy, worldMX - sx);

        // 斧头攻击点在瞒准方向上, 遇墙则停在墙面(不穿墙)
        const attackDist = 40;
        const cosA = Math.cos(p.aimAngle), sinA = Math.sin(p.aimAngle);
        const hitD = this.grid.solidRaycast(sx, sy, cosA, sinA, attackDist + p.axeRadius);
        const centerDist = Math.min(attackDist, hitD);
        const ax = sx + cosA * centerDist;
        const ay = sy + sinA * centerDist;

        // 执行攻击(传入玩家位置供视线检查, 防止隔墙破坏)
        const hits = this.grid.axeAttack(ax, ay, p.axeRadius, sx, sy);

        // === 命中反馈: 火花+碎屑+屏幕震动, 明确告知玩家是否砍中 ===
        let destroyedAny = false;
        for (const h of hits) {
            if (h.destroyed) {
                destroyedAny = true;
                // 材质碎屑
                for (let d = 0; d < 3; d++) {
                    this.particles.spawn({
                        type: 'debris', layer: 0,
                        x: h.x, y: h.y,
                        vx: (Math.random() - 0.5) * 150, vy: -Math.random() * 120 - 30,
                        gravity: 400 + Math.random() * 200, drag: 0.1,
                        size: 2 + Math.random() * 4, grow: 0,
                        decay: 1.2 + Math.random() * 1.2, alpha: 0.9,
                        wobble: 0, wobbleSpeed: 0,
                        sprite: this.particles.debrisSprite(h.color || '#666666')
                    });
                }
            }
            // 撞击火花(每次命中都进发, 让玩家看清砍在哪里)
            for (let s = 0; s < 2; s++) {
                const sa = Math.random() * Math.PI * 2;
                const spd = 60 + Math.random() * 120;
                this.particles.spawn({
                    type: 'ember', layer: 0,
                    x: h.x, y: h.y,
                    vx: Math.cos(sa) * spd, vy: Math.sin(sa) * spd - 40,
                    gravity: 200, drag: 0.8,
                    size: 1.5 + Math.random() * 2, grow: -2,
                    decay: 2.5 + Math.random() * 1.5, alpha: 1,
                    wobble: 0, wobbleSpeed: 0, flicker: true
                });
            }
        }
        if (hits.length > 0) this.shake = Math.max(this.shake, destroyedAny ? 6 : 3);

        // 设置斧头动画
        p.axeSwinging = true;
        p.axeTimer = 0.25;
        p.axeCooldown = 0.4;
        p.axeAngle = p.aimAngle;
    }

    sprayWater(dt) {
        if (!this.mouse.down || this.player.water <= 0) return;
        const p = this.player;
        const worldMX = this.mouse.x + this.camera.x;
        const worldMY = this.mouse.y + this.camera.y;
        const sx = p.x + p.w / 2;
        const sy = p.y + p.h * 0.3;
        p.aimAngle = Math.atan2(worldMY - sy, worldMX - sx);

        const equip = p.currentEquipment;

        // CO2灭火器: 向前方喷出CO2气体锥(短程宽扩散, 喷出后重气体下沉覆盖燃料表面隔绝空气)
        if (equip === 'co2') {
            const rate = 14;
            const usage = rate * dt;
            if (p.water < usage) return;
            p.water -= usage;
            for (let i = 0; i < 4; i++) {
                const a = p.aimAngle + (Math.random() - 0.5) * 0.7;   // 宽扩散
                const dist = 20 + Math.random() * 70;                 // 短程
                const wx = sx + Math.cos(a) * dist;
                const wy = sy + Math.sin(a) * dist;
                const { gx, gy } = this.grid.worldToGrid(wx, wy);
                if (!this.grid.inBounds(gx, gy)) continue;
                const gi = this.grid.idx(gx, gy);
                const gm = this.grid.material[gi];
                // 可喷入空格; 烟雾格则挤开烟雾再填充(修复: 烟区无法喷出CO2)
                if (gm !== MAT.EMPTY) {
                    if (MAT_STATE[gm] !== STATE.GAS) continue;
                    this.grid.displaceGas(gx, gy, gi);
                }
                this.grid.material[gi] = MAT.CO2;
                this.grid.life[gi] = MAT_LIFE[MAT.CO2];
                this.grid.temperature[gi] = 5;  // CO2喷出时低温(轻度冷却)
            }
            p.spraying = true;
            return;
        }

        // 水管/高压/泡沫/干粉: 喷出带初速液滴(惯性抛物线飞行, 撞墙自动沉积)
        let rate, speed, spread, count, type = 0;
        if (equip === 'highpressure') { rate = 18; speed = 560; spread = 0.1; count = 5; }
        else if (equip === 'foam') { rate = 12; speed = 460; spread = 0.3; count = 4; type = 1; }
        else if (equip === 'powder') { rate = 12; speed = 480; spread = 0.25; count = 4; type = 2; }
        else { rate = 10; speed = 500; spread = 0.2; count = 3; }

        const usage = rate * dt;
        if (p.water < usage) return;
        p.water -= usage;

        for (let i = 0; i < count; i++) {
            const a = p.aimAngle + (Math.random() - 0.5) * spread;
            const spd = speed * (0.85 + Math.random() * 0.3);
            this.droplets.push({
                x: sx + Math.cos(a) * 8,
                y: sy + Math.sin(a) * 8,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd,
                type: type,
                life: 2.0
            });
        }
        p.spraying = true;
    }

    // 烟雾探测: 检查喷淋头下方锥形区域内是否有火焰/高温(有火即有烟, 烟雾已粒子化不再入网格, 以火/热作为烟雾代理信号)
    detectFireBelow(x, y) {
        const g = this.grid;
        for (let dy = 15; dy <= 260; dy += 20) {
            const wy = y + dy;
            const halfW = 10 + dy * 0.25; // 随深度增加探测宽度(烟雾扩散锥)
            for (const ox of [-halfW, 0, halfW]) {
                const wx = x + ox;
                if (g.getFireAt(wx, wy) > 0.08) return true;
                if (g.getTempAt(wx, wy) > 150) return true;
            }
        }
        return false;
    }

    updateGame(dt) {
        if (this.state !== 'playing' || this.paused) return;
        this.time += dt;
        this.shake = Math.max(0, this.shake - dt * 25); // 震动快速衰减
        if (this.towerRefillFx) { this.towerRefillFx.t -= dt; if (this.towerRefillFx.t <= 0) this.towerRefillFx = null; }

        // 玩家更新
        this.player.update(dt, this.keys, this.grid);
        this.player.spraying = false;
        this.sprayWater(dt);

        // 网格模拟
        const activeFire = this.grid.update(dt);

        // 火焰直接烧伤 + 体温/氧气系统
        const p = this.player;
        const px = p.x + p.w / 2;
        const py = p.y + p.h / 2;
        const fireAtPlayer = this.grid.getFireAt(px, py);
        const tempAtPlayer = this.grid.getTempAt(px, py);
        // 火焰直接烧伤(保留)
        if (fireAtPlayer > 0.1 && p.invincible <= 0) {
            const dmg = p.heatShield ? fireAtPlayer * 8 : fireAtPlayer * 20;
            p.health -= dmg * dt;
        }
        // === 体温系统: 环境>40°C体温上升(隔热服减缓), >37自然回落, 超tempMax中暑扣血 ===
        if (tempAtPlayer > 40) {
            const heatRate = p.heatShield ? 0.004 : 0.012;  // 隔热服大幅降低体温上升速率
            p.bodyTemp += (tempAtPlayer - 40) * heatRate * dt;
        } else if (p.bodyTemp > 37) {
            p.bodyTemp = Math.max(37, p.bodyTemp - 1.5 * dt);  // 脱离高温环境自然降温
        }
        if (p.bodyTemp > p.tempMax) {
            p.health -= (p.bodyTemp - p.tempMax) * 2 * dt;  // 中暑扣血
        }
        // === 氧气系统: 坏空气(烟雾/CO2/可燃气/环境>150°C/附近有火)消耗氧气(SCBA大幅减缓), 否则恢复, 低于oxygenMin窒息扣血 ===
        const gasMat = this.grid.getMatAt(px, py);
        const badAir = gasMat === MAT.SMOKE || gasMat === MAT.CO2 || gasMat === MAT.FGAS || tempAtPlayer > 150 || this.grid.hasFireNear(px, py, 70);
        if (badAir) {
            const drainRate = p.hasSCBA ? 1.5 : 12;  // 空气呼吸器大幅减缓氧气消耗
            p.oxygen = Math.max(0, p.oxygen - drainRate * dt);
        } else {
            p.oxygen = Math.min(p.maxOxygen, p.oxygen + 15 * dt);  // 新鲜空气中恢复
        }
        if (p.oxygen < p.oxygenMin) {
            p.health -= (p.oxygenMin - p.oxygen) * 0.5 * dt;  // 窒息扣血
        }

        // 水雾补生: 水碰高温物体/汽化事件 -> 在事件点上方额外补生网格STEAM格(基础粒子, 走网格物理不穿墙),
        // 增强水雾量(只靠相变的单格蒸汽太稀疏)
        for (const ev of this.grid.steamEvents) {
            const puffs = 2 + (Math.random() * 2 | 0);
            for (let k = 0; k < puffs; k++) {
                this.grid.spawnGas(ev.x + (Math.random() - 0.5) * 12, ev.y - 3 - Math.random() * 10, MAT.STEAM);
            }
        }
        // 火星(烟雾已改网格SMOKE气体格: 与水雾同一套粒子/同尺寸, 见grid.updateFire; 此处不再生成VFX烟粒)
        for (const ev of this.grid.fireEvents) {
            if (Math.random() < 0.3) {
                const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
                const spd = 60 + Math.random() * 150 * ev.intensity;
                this.particles.spawn({
                    type: 'ember', layer: 0,
                    x: ev.x, y: ev.y,
                    vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                    gravity: 120 + Math.random() * 80, drag: 0.6,
                    size: 1.5 + Math.random() * 3, grow: -1,
                    decay: 0.8 + Math.random() * 1.2, alpha: 0.9,
                    wobble: 0, wobbleSpeed: 0, flicker: true
                });
            }
        }

        // 材质破坏碎屑粒子
        for (const ev of this.grid.destroyEvents) {
            for (let d = 0; d < 3; d++) {
                this.particles.spawn({
                    type: 'debris', layer: 0,
                    x: ev.x + Math.random() * 5, y: ev.y + Math.random() * 5,
                    vx: (Math.random() - 0.5) * 150, vy: -Math.random() * 120 - 30,
                    gravity: 400 + Math.random() * 200, drag: 0.1,
                    size: 2 + Math.random() * 4, grow: 0,
                    decay: 1.2 + Math.random() * 1.2, alpha: 0.9,
                    wobble: 0, wobbleSpeed: 0,
                    sprite: this.particles.debrisSprite(ev.color || '#666666')
                });
            }
        }

        // 爆炸事件(火药罐/岩浆): 火球+浓烟+碎屑+震屏
        for (const ev of this.grid.explosionEvents) {
            this.shake = Math.min(30, this.shake + ev.power * 6); // 震屏
            const n = Math.floor(ev.radius * 3);
            for (let d = 0; d < n; d++) {
                const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
                this.particles.spawn({
                    type: 'ember', layer: 1,
                    x: ev.x, y: ev.y,
                    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
                    gravity: 200, drag: 0.08,
                    size: 3 + Math.random() * 5, grow: -2,
                    decay: 0.6 + Math.random() * 0.6, alpha: 1,
                    wobble: 0, wobbleSpeed: 0
                });
            }
            for (let d = 0; d < n / 2; d++) {
                // 爆炸浓烟: 直接生成网格SMOKE气体格(与燃烧烟雾同套粒子, 不穿墙不消散)
                this.grid.spawnGas(ev.x + (Math.random() - 0.5) * ev.radius * 8, ev.y - Math.random() * ev.radius * 6, MAT.SMOKE);
            }
        }

        // 统一更新粒子(对象池, 无GC压力)
        this.particles.update(dt);

        // 飞火火星: 收集网格事件 -> 物理飞行 -> 落地点燃可燃物
        for (const ev of this.grid.emberEvents) {
            this.liveEmbers.push({ x: ev.x, y: ev.y, vx: ev.vx, vy: ev.vy, life: 2.5 + Math.random() * 1.5 });
        }
        this.updateEmbers(dt);

        // 喷射水滴: 惯性抛物线飞行 -> 撞墙/落地沉积水粒子
        this.updateDroplets(dt);

        // === 消防设施更新 ===
        // 消防栓: 范围内自动缓慢补水(无需点击, 慢慢补给)
        for (const h of this.hydrants) {
            if (h.timer > 0) h.timer -= dt;
            if (Math.abs(px - h.x) < 70 && Math.abs(py - h.y) < 70 && this.player.water < this.player.maxWater) {
                this.player.water = Math.min(this.player.maxWater, this.player.water + 17.5 * dt);
                h.active = true; h.timer = 0.5;
            }
        }
        // 水塔: 喷淋系统的蓄水池(唯一水源), 由消防员按E从玩家水箱补水(见interact), 不再直接放水
        // 烟雾探测灭火头: 消防开关开启 或 探测到下方烟雾/火焰/高温 -> 向下喷水
        // 水塔是喷淋的唯一水源(有限): 必须有水的水塔才喷水, 水塔水空/无水塔 -> 喷淋停摆;
        // (修复: 原"无水塔用市政供水无限兜底"导致无水塔关卡喷淋永远喷不完, 改为必须依赖水塔,
        //  水空后需消防员按E为水塔补水, 形成 消防栓->玩家->水塔->喷淋 的供水闭环)
        if (this.sprinklers.length > 0) {
            const src = this.towers.find(t => t.water > 0);
            if (src) {
                const switchOn = this.fireSwitches.some(s => s.on);
                let sprayed = false;
                for (const sp of this.sprinklers) {
                    const detected = switchOn || this.detectFireBelow(sp.x, sp.y);
                    if (detected && Math.random() < 0.6) {
                        this.grid.addWater(sp.x + (Math.random() - 0.5) * 14, sp.y + 6, 0.35, 0);
                        sprayed = true;
                    }
                }
                if (sprayed) src.water = Math.max(0, src.water - 30 * dt);
            }
        }

        // === 火山喷发口: 岩浆从火山口缓慢涌出; 只有完全浇灭火山口岩浆(全部冷却凝固)才能堵住 ===
        // 机制: 喷发口持续涌出岩浆并给火山口岩浆供热(地热), 环境冷却无法使其凝固;
        //       玩家浇水强冷却(在供热间隙内压到700°C以下)才能使岩浆凝固为岩石;
        //       当喷发口被凝固岩石封堵(涌出失败)且火山口无岩浆时, 才算完全堵住
        for (const vent of this.lavaVents) {
            if (!vent.active) continue;
            const c = vent.crater;
            vent.timer += dt;
            if (vent.timer < 0.3) continue;
            vent.timer = 0;
            const lavaCount = this.grid.countLavaInRegion(c.x, c.y, c.w, c.h);
            // 尝试涌出岩浆(上涌至液面): 成功=喷发口未被封堵
            let erupted = 0;
            for (let k = 0; k < 3; k++) {
                if (this.grid.addLavaCell(vent.x + (Math.random() - 0.5) * 120, vent.y + (Math.random() - 0.5) * 8)) erupted++;
            }
            if (erupted > 0) {
                // 喷发口畅通: 地热持续供热, 火山口岩浆保持熔融(环境冷却无法凝固), 玩家须浇水压制
                this.grid.reheatLava(c.x, c.y, c.w, c.h, 1000);
                vent.clearTimer = 0;
            } else if (lavaCount === 0) {
                // 喷发口被凝固岩石封堵 且 火山口已无岩浆: 岩浆被完全浇灭, 持续封堵则永久堵住
                vent.clearTimer += 0.3;
                if (vent.clearTimer >= 0.6) vent.active = false;
            } else {
                // 喷发口暂被阻挡(水封/岩壳)但仍有岩浆: 停止供热, 岩浆继续冷却凝固
                vent.clearTimer = 0;
            }
        }

        // === 救人模式: 受害者拾起/背负/送达安全区 ===
        const safeX = 130; // 安全区(左侧起点)
        for (const v of this.victims) {
            if (v.rescued || v.dead) continue;
            if (v.carried) {
                v.x = p.x + p.w / 2 - v.w / 2;   // 跟随玩家
                v.y = p.y - v.h + 10;
                if (v.x < safeX) { v.rescued = true; v.carried = false; this.score += 500; } // 送达安全区
            } else if (Math.abs((p.x + p.w / 2) - (v.x + v.w / 2)) < 32 && Math.abs((p.y + p.h / 2) - (v.y + v.h / 2)) < 55) {
                v.carried = true; // 玩家接触拾起
            }
            // 受害者火中受伤(可死亡)
            if (!v.carried && this.grid.getFireAt(v.x + v.w / 2, v.y + v.h / 2) > 0.3) {
                v.hp -= 25 * dt;
                if (v.hp <= 0) v.dead = true;
            }
        }

        // 相机跟随
        const targetCX = this.player.x - this.canvas.width / 2 + this.player.w / 2;
        const targetCY = this.player.y - this.canvas.height / 2;
        this.camera.x += (targetCX - this.camera.x) * 0.08;
        this.camera.y += (targetCY - this.camera.y) * 0.08;
        this.camera.x = Math.max(0, Math.min(this.grid.worldW - this.canvas.width, this.camera.x));
        this.camera.y = Math.max(0, Math.min(this.grid.worldH - this.canvas.height, this.camera.y));

        // HUD更新
        document.getElementById('hud-water').style.width = (this.player.water / this.player.maxWater * 100) + '%';
        document.getElementById('hud-health').style.width = Math.max(0, this.player.health) + '%';
        // 氧气条 + 体温显示(超阈值变红预警)
        document.getElementById('hud-oxygen').style.width = (this.player.oxygen / this.player.maxOxygen * 100) + '%';
        const tempEl = document.getElementById('hud-temp');
        tempEl.textContent = this.player.bodyTemp.toFixed(1) + '°C';
        tempEl.style.color = this.player.bodyTemp > this.player.tempMax ? '#ff5555' : '#fff';
        const oxyEl = document.getElementById('hud-oxygen-text');
        if (oxyEl) oxyEl.style.color = this.player.oxygen < this.player.oxygenMin ? '#ff5555' : '#fff';
        // 火势百分比: 仍有火时至少显示1%, 保证显示的"0%"真正等于全部扑灭
        // (修复: 大火场剩1-2格余火时被四舍五入成0%, 显示0%却不过关的bug)
        const firePct = activeFire > 0 ? Math.max(1, Math.round(activeFire / this.initialFireCount * 100)) : 0;
        document.getElementById('hud-fire').textContent = firePct + '%';
        document.getElementById('hud-score').textContent = this.score;
        // 救援计数HUD(有受害者时显示)
        const rescueItem = document.getElementById('hud-rescue-item');
        if (this.victims.length > 0) {
            rescueItem.style.display = '';
            const rescued = this.victims.filter(v => v.rescued).length;
            document.getElementById('hud-rescue').textContent = `${rescued}/${this.victims.length}`;
        } else {
            rescueItem.style.display = 'none';
        }

        // 胜负判定(活跃火焰归零 且 受害者全部获救/遇难 且 火山口全部堵住, 与HUD的0%严格一致)
        // (火山关: 岩浆持续喷发会不断点燃可燃物, 必须先浇灭火山口岩浆堵住喷发口才能过关;
        //  无火山喷发口的关卡 lavaVents 为空, every 恒为true不影响)
        const victimsResolved = this.victims.every(v => v.rescued || v.dead);
        const ventsBlocked = this.lavaVents.every(v => !v.active);
        if (activeFire === 0 && victimsResolved && ventsBlocked) { this.levelComplete(); }
        if (this.player.health <= 0) { this.gameOver(); }
    }

    // 飞火火星: 抛物线飞行(重力/阻力), 落到可燃固体表面将其点燃(真实飞火蔓延)
    updateEmbers(dt) {
        const g = this.grid;
        for (let k = this.liveEmbers.length - 1; k >= 0; k--) {
            const em = this.liveEmbers[k];
            em.life -= dt;
            em.vy += 380 * dt;               // 重力
            em.vx *= (1 - 0.6 * dt);         // 空气阻力
            em.x += em.vx * dt;
            em.y += em.vy * dt;
            const { gx, gy } = g.worldToGrid(em.x, em.y);
            let dead = em.life <= 0 || !g.inBounds(gx, gy);
            if (!dead) {
                const i = g.idx(gx, gy);
                const m = g.material[i];
                // 撞到固体/液体表面: 可燃+未燃烧+有空气接触 -> 点燃(飞火引燃远处易燃物)
                if (m !== MAT.EMPTY && MAT_STATE[m] !== STATE.GAS) {
                    if (MAT_FLAMMABLE[m] && g.fire[i] < 0.01 && g.airContact(gx, gy) > 0) {
                        g.fire[i] = 0.2 + Math.random() * 0.15;
                        if (g.fuel[i] <= 0) g.fuel[i] = MAT_FUEL[m];
                        g.temperature[i] = Math.max(g.temperature[i], MAT_IGNITION[m] + 30);
                    }
                    dead = true; // 落地即熄灭(无论是否点燃成功)
                }
            }
            if (dead) this.liveEmbers.splice(k, 1);
        }
    }

    // 喷射水滴: 惯性抛物线飞行, 撞固体/液体表面时在上一个空格沉积水粒子
    updateDroplets(dt) {
        const g = this.grid;
        for (let k = this.droplets.length - 1; k >= 0; k--) {
            const d = this.droplets[k];
            d.life -= dt;
            const prevX = d.x, prevY = d.y;
            d.vy += 700 * dt;                // 重力 -> 抛物线轨迹
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            const { gx, gy } = g.worldToGrid(d.x, d.y);
            // 飞出边界: 直接移除
            if (!g.inBounds(gx, gy)) { this.droplets.splice(k, 1); continue; }
            const i = g.idx(gx, gy);
            const m = g.material[i];
            // 撞到固体/液体表面: 在上一个空格沉积(泛化: WATER/FOAM/POWDER);
            // 上一格可能是烟雾格, 交由addWater挤开气体后沉积
            if (m !== MAT.EMPTY && MAT_STATE[m] !== STATE.GAS) {
                const { gx: pgx, gy: pgy } = g.worldToGrid(prevX, prevY);
                if (g.inBounds(pgx, pgy)) {
                    g.addWater(prevX, prevY, 0.3, d.type);
                }
                this.droplets.splice(k, 1);
                continue;
            }
            // 寿命耗尽仍未命中: 在当前格沉积(修复: 原直接删除导致水喷射一段距离凭空消失;
            // 当前格为烟雾时由addWater挤开气体沉积)
            if (d.life <= 0) {
                g.addWater(d.x, d.y, 0.3, d.type);
                this.droplets.splice(k, 1);
            }
        }
    }

    levelComplete() {
        this.state = 'complete';
        const rescued = this.victims.filter(v => v.rescued).length;
        const dead = this.victims.filter(v => v.dead).length;
        this.score += 1000 + Math.round(this.player.health * 10);
        // 每过一关升级副武器: 按进阶序列解锁下一把(跨关卡保留)
        const nextWeapon = WEAPON_PROGRESSION.find(w => !this.unlockedWeapons.includes(w));
        let unlockMsg = '';
        if (nextWeapon) {
            this.unlockedWeapons.push(nextWeapon);
            unlockMsg = ` | 🔓 解锁新武器: ${EQUIP_NAMES[nextWeapon]}`;
        }
        document.getElementById('gameover-text').textContent = '🎉 关卡完成!';
        let info = `得分: ${this.score} | 剩余生命: ${Math.round(this.player.health)}%`;
        if (this.victims.length > 0) info += ` | 救出: ${rescued}人${dead > 0 ? ' | 遇难: ' + dead + '人' : ''}`;
        info += unlockMsg;
        document.getElementById('gameover-score').textContent = info;
        document.getElementById('game-over').style.display = 'flex';
        document.getElementById('retry-btn').textContent = this.currentLevel < LEVELS.length - 1 ? '下一关' : '🎊 通关!再来一次';
        document.getElementById('retry-btn').onclick = () => {
            document.getElementById('game-over').style.display = 'none';
            const next = this.currentLevel < LEVELS.length - 1 ? this.currentLevel + 1 : 0;
            if (next === 0) { this.score = 0; this.unlockedWeapons = ['hose']; } // 新周目重置武器进度
            this.showLevelIntro(next);
        };
    }

    gameOver() {
        this.state = 'gameover';
        document.getElementById('gameover-text').textContent = '💀 消防员倒下了...';
        document.getElementById('gameover-score').textContent = `得分: ${this.score}`;
        document.getElementById('game-over').style.display = 'flex';
        document.getElementById('retry-btn').textContent = '重新挑战';
        document.getElementById('retry-btn').onclick = () => {
            document.getElementById('game-over').style.display = 'none';
            this.showLevelIntro(this.currentLevel);
        };
    }

    // ==================== 渲染系统 ====================
    render() {
        const ctx = this.ctx;
        const W = this.canvas.width, H = this.canvas.height;
        ctx.clearRect(0, 0, W, H);

        // 背景渐变
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#0d1b2a');
        bg.addColorStop(1, '#1b263b');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        if (this.state === 'intro') return;
        if (!this.grid) return;

        ctx.save();
        // 屏幕震动(斧头命中反馈): 随机偏移相机
        let shX = 0, shY = 0;
        if (this.shake > 0.1) {
            shX = (Math.random() - 0.5) * this.shake;
            shY = (Math.random() - 0.5) * this.shake;
        }
        ctx.translate(-this.camera.x + shX, -this.camera.y + shY);

        this.renderGrid(ctx);
        this.renderFacilities(ctx);
        this.renderPlayer(ctx);
        this.renderProjectiles(ctx);
        this.particles.render(ctx);

        ctx.restore();

        // 暂停提示
        if (this.paused) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#fff';
            ctx.font = '36px Microsoft YaHei';
            ctx.textAlign = 'center';
            ctx.fillText('⏸ 已暂停', W / 2, H / 2);
            ctx.textAlign = 'left';
        }
    }

    renderGrid(ctx) {
        const g = this.grid;
        const cs = g.cellSize;
        // 只渲染可见区域
        const startX = Math.max(0, Math.floor(this.camera.x / cs));
        const startY = Math.max(0, Math.floor(this.camera.y / cs));
        const endX = Math.min(g.cols, Math.ceil((this.camera.x + this.canvas.width) / cs));
        const endY = Math.min(g.rows, Math.ceil((this.camera.y + this.canvas.height) / cs));

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const i = g.idx(x, y);
                const px = x * cs, py = y * cs;
                const mat = g.material[i];
                if (mat === MAT.EMPTY && g.fire[i] < 0.02 && g.temperature[i] < 150) continue;
                const st = MAT_STATE[mat];

                // 绘制粒子(按态)
                if (st === STATE.SOLID) {
                    // 纹理渲染: 世界空间连续图案(钢筋水泥/木板/金属/砖墙/门), 无纹理时回退单色
                    const pat = this.texturePatterns[mat];
                    if (pat) {
                        ctx.fillStyle = pat;
                        ctx.fillRect(px, py, cs, cs);
                    } else {
                        ctx.fillStyle = MAT_PROPS[mat].color;
                        ctx.fillRect(px, py, cs, cs);
                    }
                } else if (st === STATE.LIQUID) {
                    if (mat === MAT.WATER) {
                        const wt = g.temperature[i];
                        if (wt > 60) {
                            const heat = Math.min(1, (wt - 60) / 80);
                            ctx.fillStyle = `rgba(${Math.floor(30 + heat * 200)},${Math.floor(144 - heat * 80)},255,0.75)`;
                        } else {
                            ctx.fillStyle = 'rgba(30,144,255,0.75)';
                        }
                    } else if (mat === MAT.FOAM) {
                        ctx.fillStyle = 'rgba(220,240,255,0.85)';
                    } else if (mat === MAT.MOLTEN) {
                        // 铁水: 高温发光液体, 亮度随温度(1500红橙->2000亮黄)+闪烁
                        const glow = Math.min(1, Math.max(0, (g.temperature[i] - 1500) / 500));
                        const flicker = 0.85 + Math.sin(this.time * 12 + i * 3.7) * 0.15;
                        ctx.fillStyle = `rgba(255,${Math.floor((90 + glow * 140) * flicker)},${Math.floor(30 * glow)},1)`;
                    } else if (mat === MAT.LAVA) {
                        // 岩浆: 高温发光液体(700暗红->1200亮橙黄)+脉动闪烁+表面裂纹暗纹
                        const glow = Math.min(1, Math.max(0, (g.temperature[i] - 700) / 500));
                        const pulse = 0.8 + Math.sin(this.time * 6 + i * 2.3) * 0.2;
                        const r = Math.floor((180 + glow * 75) * pulse);
                        const gr = Math.floor((40 + glow * 120) * pulse);
                        ctx.fillStyle = `rgba(${r},${gr},0,1)`;
                    } else if (mat === MAT.GASOLINE) {
                        // 汽油: 淡黄半透明液体, 表面微光泽闪烁(区别于深棕原油OIL)
                        const shimmer = 0.8 + Math.sin(this.time * 9 + i * 1.7) * 0.12;
                        ctx.fillStyle = `rgba(212,160,23,${(0.82 * shimmer).toFixed(2)})`;
                    } else if (mat === MAT.TAR) {
                        // 沥青: 近黑粘稠液体(高温时微微泛红)
                        const hot = Math.min(1, Math.max(0, (g.temperature[i] - 200) / 600));
                        ctx.fillStyle = `rgba(${Math.floor(26 + hot * 90)},${Math.floor(18 + hot * 20)},8,0.95)`;
                    } else { // OIL
                        ctx.fillStyle = 'rgba(58,42,16,0.9)';
                    }
                    ctx.fillRect(px, py, cs, cs);
                } else if (st === STATE.GAS) {
                    // 气体与液体/固体同一套方块像素渲染(单色半透明方块, 寿命衰减渐淡; 无精灵overdraw开销)
                    const lifeRatio = Math.min(1, g.life[i] / (MAT_LIFE[mat] || 1));
                    if (mat === MAT.STEAM) ctx.fillStyle = `rgba(207,232,245,${(0.25 + lifeRatio * 0.35).toFixed(2)})`;
                    else if (mat === MAT.SMOKE) ctx.fillStyle = `rgba(58,60,70,${(0.45 + lifeRatio * 0.4).toFixed(2)})`;
                    else if (mat === MAT.CO2) ctx.fillStyle = `rgba(184,200,216,${(0.3 + lifeRatio * 0.4).toFixed(2)})`;
                    else ctx.fillStyle = `rgba(122,154,74,${(0.25 + lifeRatio * 0.35).toFixed(2)})`;
                    ctx.fillRect(px, py, cs, cs);
                } else if (st === STATE.EMPTY && g.temperature[i] > 150) {
                    // 热空气可视化: 粒子化橙红热浪(hash偏移+有机漂移+双层, 消除网格感; 危险区预警)
                    const heat = Math.min(1, (g.temperature[i] - 150) / 450);
                    const flicker = 0.7 + Math.sin(this.time * 8 + i * 2.1) * 0.3;
                    const h1 = Math.sin(i * 12.9898) * 43758.5453;
                    const rnd1 = h1 - Math.floor(h1);
                    const h2 = Math.sin(i * 78.233) * 43758.5453;
                    const rnd2 = h2 - Math.floor(h2);
                    const ph = i * 1.37;
                    const wobX = Math.sin(this.time * 2.2 + ph) * 4;
                    const wobY = Math.cos(this.time * 1.8 + ph * 1.3) * 4 - 2;  // 略向上漂移(热空气上升)
                    const offX = (rnd1 - 0.5) * 10;
                    const offY = (rnd2 - 0.5) * 10;
                    const sz = cs * (2.2 + rnd2 * 0.6);
                    const cx = px + cs / 2 + offX + wobX;
                    const cy = py + cs / 2 + offY + wobY;
                    ctx.globalAlpha = heat * 0.25 * flicker;
                    ctx.drawImage(this.particles.sprites.heat, Math.round(cx - sz / 2), Math.round(cy - sz / 2), Math.round(sz), Math.round(sz));
                    const sz2 = sz * 0.65;
                    ctx.globalAlpha = heat * 0.15 * flicker;
                    ctx.drawImage(this.particles.sprites.heat, Math.round(cx - sz2 / 2 + offX * 0.5), Math.round(cy - sz2 / 2 - offY * 0.5), Math.round(sz2), Math.round(sz2));
                    ctx.globalAlpha = 1;
                }

                // 绘制火焰(Noita风格多层)
                if (g.fire[i] > 0.02) {
                    const f = g.fire[i];
                    ctx.fillStyle = `rgba(255,80,0,${f * 0.3})`;
                    ctx.fillRect(px - 1, py - 2, cs + 2, cs + 2);
                    ctx.fillStyle = `rgba(255,${Math.floor(120 + f * 80)},0,${f * 0.7})`;
                    ctx.fillRect(px, py, cs, cs);
                    if (f > 0.6) {
                        ctx.fillStyle = `rgba(255,255,200,${(f - 0.6) * 1.5})`;
                        ctx.fillRect(px + 1, py + 1, cs - 2, cs - 2);
                    }
                }
            }
        }
    }

    // 飞火火星 + 喷射水滴渲染
    renderProjectiles(ctx) {
        const emberSprite = this.particles.sprites.ember;
        // 飞火火星: 橙红发光粒子(带闪烁)
        for (const em of this.liveEmbers) {
            const flicker = 0.6 + Math.sin(this.time * 20 + em.x * 0.5) * 0.4;
            ctx.globalAlpha = Math.min(1, em.life) * flicker;
            const sz = 4 + Math.random() * 2;
            ctx.drawImage(emberSprite, Math.round(em.x - sz / 2), Math.round(em.y - sz / 2), sz, sz);
        }
        ctx.globalAlpha = 1;
        // 喷射水滴: 小圆点(按类型着色: 水/泡沫/干粉)
        for (const d of this.droplets) {
            ctx.fillStyle = d.type === 1 ? 'rgba(220,240,255,0.9)' : (d.type === 2 ? 'rgba(230,225,210,0.9)' : 'rgba(80,170,255,0.9)');
            ctx.beginPath();
            ctx.arc(d.x, d.y, 2.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    renderPlayer(ctx) {
        const p = this.player;
        if (!p) return;
        ctx.save();
        ctx.translate(p.x + p.w / 2, p.y + p.h / 2);

        // 消防员像素画精灵(行走动画帧+翻向+受伤闪烁+攀墙姿态)
        const flash = p.invincible > 0 && Math.sin(this.time * 30) > 0;
        const moving = Math.abs(p.vx) > 10 && p.grounded;
        const onWall = p.climbing || p.wallSliding;
        const frame = onWall ? Math.floor(this.time * 6) % 3 : (moving ? Math.floor(this.time * 9) % 3 : 0);
        const sprite = this.playerSprites ? this.playerSprites[frame] : null;
        if (sprite) {
            if (flash) ctx.globalAlpha = 0.45;
            ctx.save();
            if (Math.cos(p.aimAngle) < 0) ctx.scale(-1, 1); // 翻向膝准方向
            // 攀墙/墙滑: 身体向墙面倾斜(攀墙姿态反馈)
            if (onWall) ctx.rotate(0.18 * (p.wallDir || 1));
            ctx.drawImage(sprite, -p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
            ctx.globalAlpha = 1;
        } else {
            ctx.fillStyle = flash ? '#fff' : '#e63946';
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }

        // 水管方向
        if (p.spraying || this.mouse.down) {
            ctx.strokeStyle = '#aaa';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(0, -5);
            const len = 25;
            ctx.lineTo(Math.cos(p.aimAngle) * len, Math.sin(p.aimAngle) * len - 5);
            ctx.stroke();
            // 喷水效果
            if (p.spraying) {
                ctx.strokeStyle = 'rgba(100,200,255,0.6)';
                ctx.lineWidth = 2;
                for (let i = 0; i < 3; i++) {
                    const a = p.aimAngle + (Math.random() - 0.5) * 0.3;
                    const d = 30 + Math.random() * 40;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(p.aimAngle) * 25, Math.sin(p.aimAngle) * 25 - 5);
                    ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d - 5);
                    ctx.stroke();
                }
            }
        }

        // 消防斧头挥动动画
        if (p.axeSwinging) {
            const progress = 1 - (p.axeTimer / 0.25);
            const swingAngle = p.axeAngle - 0.8 + progress * 1.6;
            ctx.save();
            ctx.rotate(swingAngle);
            // 斧柄
            ctx.strokeStyle = '#8B4513';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(30, 0);
            ctx.stroke();
            // 斧头
            ctx.fillStyle = '#c0c0c0';
            ctx.beginPath();
            ctx.moveTo(28, -6);
            ctx.lineTo(36, -3);
            ctx.lineTo(36, 3);
            ctx.lineTo(28, 6);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            // 挥动弧线
            ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - progress)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 32, p.axeAngle - 0.8, swingAngle);
            ctx.stroke();
        }
        ctx.restore();
    }

    renderFacilities(ctx) {
        // 消防栓(红色栓体+顶盖+双侧出水口+底座)
        for (const h of this.hydrants) {
            const active = h.timer > 0;
            // 底座
            ctx.fillStyle = '#5a4a40';
            ctx.fillRect(h.x - 10, h.y - 4, 20, 4);
            // 栓体
            ctx.fillStyle = active ? '#4ecdc4' : '#c0392b';
            ctx.fillRect(h.x - 7, h.y - 22, 14, 18);
            // 双侧出水口(圆帽)
            ctx.fillStyle = active ? '#3aa89f' : '#962d22';
            ctx.beginPath(); ctx.arc(h.x - 9, h.y - 14, 4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(h.x + 9, h.y - 14, 4, 0, Math.PI * 2); ctx.fill();
            // 顶盖(圆顶+提手)
            ctx.fillStyle = active ? '#4ecdc4' : '#e74c3c';
            ctx.beginPath(); ctx.arc(h.x, h.y - 22, 8, Math.PI, 0); ctx.fill();
            ctx.fillRect(h.x - 2, h.y - 32, 4, 4);
            // 高光(左侧反光)
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(h.x - 5, h.y - 20, 3, 14);
            // 标识H
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 9px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('H', h.x, h.y - 8);
        }
        // 喷淋水管: 每个烟雾探测头连接到最近水塔(供水管线, 深色粗管+高光)
        if (this.towers.length > 0) {
            ctx.lineCap = 'round';
            for (const sp of this.sprinklers) {
                let best = null, bd = 1e9;
                for (const t of this.towers) {
                    const d = Math.abs(sp.x - t.x) + Math.abs(sp.y - t.y);
                    if (d < bd) { bd = d; best = t; }
                }
                if (!best) continue;
                const tankBottom = best.y + 32;
                // 管路: 喷头 -> 水平走到水塔下方 -> 垂直上到罐底
                ctx.strokeStyle = '#4a5568';
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(sp.x, sp.y);
                ctx.lineTo(best.x, sp.y);
                ctx.lineTo(best.x, tankBottom);
                ctx.stroke();
                ctx.strokeStyle = 'rgba(255,255,255,0.18)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(sp.x, sp.y - 1);
                ctx.lineTo(best.x, sp.y - 1);
                ctx.stroke();
            }
        }
        // 水塔(2倍尺寸罐体80x64+支腿落地+斜撑+水位计+阀)
        for (const t of this.towers) {
            const legTop = t.y + 32, legBot = this.grid.worldH - 30;
            // 支腿(落地支撑)
            ctx.fillStyle = '#3949ab';
            ctx.fillRect(t.x - 38, legTop, 10, legBot - legTop);
            ctx.fillRect(t.x + 28, legTop, 10, legBot - legTop);
            // 斜撑(X型加固)
            ctx.strokeStyle = '#3949ab';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(t.x - 33, legTop + 8); ctx.lineTo(t.x + 33, legBot - 8);
            ctx.moveTo(t.x + 33, legTop + 8); ctx.lineTo(t.x - 33, legBot - 8);
            ctx.stroke();
            // 罐体(圆角, 80x64)
            ctx.fillStyle = '#5c6bc0';
            ctx.beginPath();
            ctx.roundRect(t.x - 40, t.y - 32, 80, 64, 8);
            ctx.fill();
            // 罐顶(椭圆盖)
            ctx.fillStyle = '#7986cb';
            ctx.beginPath(); ctx.ellipse(t.x, t.y - 32, 40, 8, 0, 0, Math.PI * 2); ctx.fill();
            // 水位计(右侧透明管)
            const ratio = t.water / t.maxWater;
            ctx.fillStyle = 'rgba(30,40,80,0.6)';
            ctx.fillRect(t.x + 30, t.y - 26, 6, 52);
            ctx.fillStyle = `rgba(72,202,228,${0.6 + ratio * 0.4})`;
            ctx.fillRect(t.x + 30, t.y - 26 + 52 * (1 - ratio), 6, 52 * ratio);
            // 罐体高光
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fillRect(t.x - 32, t.y - 26, 8, 50);
            // 标签
            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('水塔', t.x, t.y - 42);
            // 补水提示(罐底, 缺水时高亮提醒消防员按E补水)
            const low = ratio < 0.3;
            ctx.fillStyle = low ? '#ffd166' : '#4ecdc4';
            ctx.beginPath(); ctx.arc(t.x, t.y + 38, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = low ? '#ffd166' : '#ccc';
            ctx.font = '8px Arial';
            ctx.fillText(low ? '缺水!按E补水' : '按E补水', t.x, t.y + 52);
        }
        // 水塔补水浮动提示(+X 上飘淡出)
        if (this.towerRefillFx) {
            const fx = this.towerRefillFx;
            const alpha = Math.min(1, fx.t / 0.8);
            ctx.fillStyle = `rgba(78,205,196,${alpha})`;
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`+${fx.amount} 水`, fx.x, fx.y - 50 - (0.8 - fx.t) * 30);
        }
        // 烟雾探测灭火头(天花板红色喷头+热敏泡)
        for (const sp of this.sprinklers) {
            ctx.fillStyle = '#888';
            ctx.fillRect(sp.x - 6, sp.y - 2, 12, 3);
            ctx.fillStyle = '#c0392b';
            ctx.beginPath(); ctx.moveTo(sp.x - 4, sp.y + 1); ctx.lineTo(sp.x + 4, sp.y + 1); ctx.lineTo(sp.x, sp.y + 7); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath(); ctx.arc(sp.x, sp.y + 8, 2, 0, Math.PI * 2); ctx.fill();
        }
        // 消防开关(墙面红箱, 开启变绿+E提示)
        for (const s of this.fireSwitches) {
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(s.x - 9, s.y - 12, 18, 24);
            ctx.fillStyle = s.on ? '#2ecc71' : '#c0392b';
            ctx.fillRect(s.x - 6, s.y - 9, 12, 12);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 8px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(s.on ? 'ON' : 'OFF', s.x, s.y + 9);
            ctx.fillStyle = 'rgba(255,255,100,0.85)';
            ctx.font = '9px Arial';
            ctx.fillText('E', s.x, s.y - 16);
        }
        // 受害者(救人模式: 平民像素画, 待救内闪! / 死亡倒地)
        for (const v of this.victims) {
            if (v.rescued) continue;
            ctx.save();
            ctx.translate(v.x + v.w / 2, v.y + v.h / 2);
            if (v.dead) {
                ctx.fillStyle = '#5a5a5a';
                ctx.fillRect(-v.w / 2, v.h / 2 - 8, v.w, 8);
                ctx.fillStyle = '#999';
                ctx.beginPath(); ctx.arc(-v.w / 2 + 5, v.h / 2 - 4, 5, 0, Math.PI * 2); ctx.fill();
            } else {
                ctx.fillStyle = '#e67e22';
                ctx.fillRect(-v.w / 2, -v.h / 2 + 12, v.w, v.h - 20);
                ctx.fillStyle = '#f0c090';
                ctx.beginPath(); ctx.arc(0, -v.h / 2 + 7, 7, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#5a3a1a';
                ctx.beginPath(); ctx.arc(0, -v.h / 2 + 4, 7, Math.PI, 0); ctx.fill();
                ctx.fillStyle = '#34495e';
                ctx.fillRect(-v.w / 2 + 2, v.h / 2 - 8, 7, 8);
                ctx.fillRect(v.w / 2 - 9, v.h / 2 - 8, 7, 8);
                if (!v.carried && Math.sin(this.time * 6) > 0) {
                    ctx.fillStyle = '#ff5555';
                    ctx.font = 'bold 14px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('!', 0, -v.h / 2 - 6);
                }
            }
            ctx.restore();
        }
        // 安全区提示(背负受害者时左侧绿色区域闪烁)
        if (this.victims.some(v => v.carried)) {
            ctx.fillStyle = `rgba(46,204,113,${0.18 + Math.sin(this.time * 4) * 0.1})`;
            ctx.fillRect(0, 0, 130, this.grid.worldH);
            ctx.fillStyle = '#2ecc71';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('← 安全区', 65, 120);
        }
        ctx.textAlign = 'left';
    }

    // ==================== 游戏主循环 ====================
    gameLoop(timestamp) {
        const dt = Math.min(0.033, (timestamp - this.lastTime) / 1000);
        this.lastTime = timestamp;

        this.updateGame(dt);
        this.render();

        requestAnimationFrame((t) => this.gameLoop(t));
    }
}

// ==================== 启动游戏 ====================
window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    window.game = new FirefighterGame(canvas);
});
