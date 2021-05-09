const ccxt = require('ccxt');
const axios = require('axios');

const DAYS_TO_EVALUATE = 7;
const MIN_ORDER_VOLUME = 10.00; // BUSD

// https://help.lunarcrush.com/en/articles/2717778-how-is-correlation-score-calculated
const LUNAR_CORRELATION_STANDPOINT = 2.5;

class Trader {
    constructor(config) {
        this.config = config;
        const { base, asset, buySpread, sellSpread, buyAllocation, sellAllocation } = this.config;

        this.binanceClient = new ccxt.binance({
            apiKey: process.env.API_KEY,
            secret: process.env.API_SECRET,
        });

        /** bot trading options */
        this.base = base;
        this.asset = asset;

        this.market = `${ this.asset }/${ this.base }`;

        this.buySpread = buySpread;
        this.buyAllocation = buyAllocation;

        this.sellSpread = sellSpread;
        this.sellAllocation = sellAllocation;

        /** market price ticker; mostly used { last, bid, ask } */
        this.price = null;

        /** Binance account balance */
        this.balance = null;
        this.baseBalance = null;
        this.assetBalance = null;

        this.openOrders = [];
        this.closedOrders = [];

        /** LunarCRUSH social data: various scores and ranking (https://lunarcrush.com/developers/docs) */
        this.lunarData = null;

        this.printStartupMessage();
    };

    start = () => {
        this.tick();

        // enable continuous trading
        setInterval(this.tick.bind(this), this.config.tickInterval);
    };

    tick = async () => {
        await Promise.all([
            this.fetchBalance(),
            this.fetchMarketPrice(),
            this.fetchOpenOrders(),
            this.fetchClosedOrders(DAYS_TO_EVALUATE),
            this.fetchLunarData(),
        ]);

        this.printIterationInfo();

        /** determine if buying is a good option */
        const buyOrder = this.getBuyOrder();
        if (this.shouldBuy(buyOrder)) {
            await this.cancelOrders('buy');
            await this.createBuyOrder(buyOrder);
        }

        /** determine if selling is a good option */
        const sellOrder = this.getSellOrder();
        if (this.shouldSell(sellOrder)) {
            await this.cancelOrders('sell');
            await this.createSellOrder(sellOrder);
        }
    };

    shouldBuy = (order) => {
        if (order.totalToBeBought < MIN_ORDER_VOLUME) {
            console.log(`[${ this.market }] [...] buy order of ${ this.round(order.totalToBeBought) } cannot be created`);
            return false;
        }

        const sellOpenOrder = this.getOpenOrder('sell');
        if (sellOpenOrder !== null && order.buyPrice > sellOpenOrder.price) {
            console.log(`[${ this.market }] [...] buy price ${ order.buyPrice } is higher than sell ${ sellOpenOrder.price }`);
            return false;
        }

        const buyOpenOrder = this.getOpenOrder('buy');
        if (buyOpenOrder !== null) {

            /** allow buy order when the last SELL price was high enough */
            if (this.closedOrders.length > 0) {
                const lastClosedOrder = this.closedOrders[this.closedOrders.length - 1];
                if (lastClosedOrder.side === 'sell') {
                    // between last closed SELL order & currently open BUY order
                    const delta1 = (lastClosedOrder.price - order.buyPrice) / order.buyPrice;

                    // between currently open BUY order & new BUY order
                    const delta2 = Math.abs((order.buyPrice - buyOpenOrder.price) / order.buyPrice);

                    if (delta1 > this.buySpread && delta2 > this.buySpread) {
                        console.log(`[${ this.market }] [!] successful SELL order determined ${ lastClosedOrder.amount } @ ${ lastClosedOrder.price }`);
                        return true;
                    }
                }
            }

            console.log(`[${ this.market }] [...] buy order is still open`);
            return false;
        }

        return true;
    };

    shouldSell = (order) => {
        if (order.totalToBeSold < MIN_ORDER_VOLUME) {
            console.log(`[${ this.market }] [...] sell order of ${ this.round(order.totalToBeSold) } cannot be created`);
            return false;
        }

        const buyOpenOrder = this.getOpenOrder('buy');
        if (buyOpenOrder !== null && order.sellPrice < buyOpenOrder.price) {
            console.log(`[${ this.market }] [...] sell price ${ order.sellPrice } is lower than buy ${ buyOpenOrder.price }`);
            return false;
        }

        const sellOpenOrder = this.getOpenOrder('sell');
        if (sellOpenOrder !== null) {
            // TODO: reconsider if the current sell order is still a good option

            console.log(`[${ this.market }] [...] sell order is still open`);
            return false;
        }

        return true;
    };

    getBuyOrder = () => {
        let priceDrop = this.buySpread;
        if (this.lunarData !== null) {
            priceDrop = (this.buySpread + this.lunarData.volatility) / 2;
        }
        const buyPrice = this.price.bid * (1 - priceDrop);

        let lunarImpact = 1;
        if (this.lunarData !== null) {
            lunarImpact = this.lunarData.correlation_rank / LUNAR_CORRELATION_STANDPOINT;
        }
        const buyVolume = ((this.baseBalance * this.buyAllocation) / this.price.bid) * lunarImpact;
        const totalToBeBought = buyVolume * buyPrice;

        return { buyPrice, buyVolume, totalToBeBought };
    };

    getSellOrder = () => {
        let priceRise = this.sellSpread;
        if (this.lunarData !== null) {
            priceRise = (this.sellSpread + this.lunarData.volatility) / 2;
        }
        const sellPrice = this.price.ask * (1 + priceRise);

        let lunarImpact = 1;
        if (this.lunarData !== null) {
            lunarImpact = 1 / (this.lunarData.correlation_rank / LUNAR_CORRELATION_STANDPOINT);
        }
        const sellVolume = (this.assetBalance * this.sellAllocation) * lunarImpact;
        const totalToBeSold = sellVolume * sellPrice;

        return { sellPrice, sellVolume, totalToBeSold };
    };

    createBuyOrder = async (order) => {
        if (order.totalToBeBought > MIN_ORDER_VOLUME && this.isProduction()) {
            console.log(`[${ this.market }] [!] [+] buying ${ this.round(order.buyVolume) } ${ this.asset } @ ${ this.round(order.buyPrice) } => ${ this.round(order.totalToBeBought) } ${ this.base }`);
            await this.binanceClient.createLimitBuyOrder(this.market, order.buyVolume, order.buyPrice);
        }
    };

    createSellOrder = async (order) => {
        if (order.totalToBeSold > MIN_ORDER_VOLUME && this.isProduction()) {
            console.log(`[${ this.market }] [!] [-] selling ${ this.round(order.sellVolume) } ${ this.asset } @ ${ this.round(order.sellPrice) } => ${ this.round(order.totalToBeSold) } ${ this.base }`);
            await this.binanceClient.createLimitSellOrder(this.market, order.sellVolume, order.sellPrice);
        }
    };

    cancelOrders = async (side = null) => {
        for (const order of this.openOrders) {
            if ((side === order.side || side === null) && this.isProduction()) {
                console.log(`[${ this.market }] [!] [/] canceling order`, order.id, order.status, order.side, order.amount, this.asset, '@', order.price, this.base);
                await this.binanceClient.cancelOrder(order.id, this.market);
            }
        }
    };

    fetchBalance = async () => {
        this.balance = await this.binanceClient.fetchBalance();
        this.baseBalance = this.balance.free[this.base];
        this.assetBalance = this.balance.free[this.asset];
    };

    fetchMarketPrice = async () => {
        this.price = await this.binanceClient.fetchTicker(this.market);
    };

    fetchOpenOrders = async () => {
        this.openOrders = await this.binanceClient.fetchOpenOrders(this.market);
    };

    fetchClosedOrders = async (days) => {
        const since = this.binanceClient.milliseconds() - days * 86400 * 1000; // 7 days
        this.closedOrders = await this.binanceClient.fetchClosedOrders(this.market, since);
    };

    fetchLunarData = async () => {
        await axios.get(
            `https://api.lunarcrush.com/v2?data=assets&key=${ process.env.LUNAR_API_KEY }&symbol=${ this.asset }&data_points=0`
        ).then((response) => {
            this.lunarData = response.data.data[0];
        }).catch((error) => {
            console.log(`[${ this.market }] ERROR!`, error);
        });
    };

    getOpenOrder = (side) => {
        for (const order of this.openOrders) {
            if (order.side === side) {
                return order;
            }
        }
        return null;
    };

    isProduction = () => {
        return process.env.ENV === 'prod';
    };

    /** mainly used for printing */
    round = (n) => {
        return Math.round(n * 10000) / 10000;
    };

    printStartupMessage = () => {
        console.log(`
            [${ this.market }] Launching bot...
                - buy spread: ${ this.buySpread }
                - buy allocation: ${ this.buyAllocation }
                - sell spread: ${ this.sellSpread }
                - sell allocation: ${ this.sellAllocation }
        `);
    };

    printIterationInfo = () => {
        console.log(`[${ this.market }] >>>>>>>>>> ${ (new Date()).toUTCString() }`);
        console.log(`[${ this.market }] [$] base ${ this.baseBalance }`);
        console.log(`[${ this.market }] [$] asset ${ this.assetBalance }`);
        console.log(`[${ this.market }] [~] market price ${ this.price.last }`);
        console.log(`[${ this.market }] [i] volatility ${ this.lunarData !== null ? this.lunarData.volatility : 'N/A' }`);
        console.log(`[${ this.market }] [i] LunarCRUSH correlation ${ this.lunarData !== null ? this.lunarData.correlation_rank : 'N/A' }`);
        for (const order of this.openOrders) {
            console.log(
                `[${ this.market }] [i]`,
                order.side,
                order.amount,
                this.asset,
                '@',
                order.price,
                '=>',
                this.round(order.amount * order.price),
                this.base
            );
        }
    };
};

module.exports = {
    Trader: Trader
};
