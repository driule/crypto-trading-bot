require('dotenv').config;

const ccxt = require('ccxt');
const axios = require('axios');

const tick = async(config, binanceClient) => {
    const { asset, base, spread, buyAllocation, sellAllocation } =  config;
    const market = `${asset}/${base}`;

    // check Binance balance 
    // const balances = await binanceClient.fetchBalance();
    // console.log('Free asset (DOGE)', balances.free[asset]);
    // console.log('Free base (USDT)', balances.free[asset]);

    /** cancel previously scheduled (limit) orders for the market */
    const order = await binanceClient.fetchOpenOrders(market);
    order.forEach(async order => {
        await binanceClient.cancelOrder(order.id);
    });

    const coingeckoPrices = await Promise.all([
        axios.get(
            'https://api.coingecko.com/api/v3/simple/price?ids=dogecoin&vs_currencies=USD'
        ),
        axios.get(
            'https://api.coingecko.com/api/v3/simple/price?ids=busd&vs_currencies=USD'
        ),
    ]);

    const USD_PER_DOGE = coingeckoPrices[0].data.dogecoin.usd;
    const USD_PER_USDT = coingeckoPrices[1].data.busd.usd;

    console.log('USD per DOGE', USD_PER_DOGE);
    console.log('USD per USDT', USD_PER_USDT);

    /** 
     * calculate SELL & BUY orders
     * */
    const marketPrice = USD_PER_DOGE / USD_PER_USDT;
    console.log('market price', marketPrice);

    const buyPrice = marketPrice * (1 - spread);
    const sellPrice = marketPrice * (1 + spread);

    /** availbale assets balance */
    const balances = await binanceClient.fetchBalance();
    const baseBalance = balances.free[base];
    const assetBalance = balances.free[asset];

    console.log('[BUSD] base balance', baseBalance);
    console.log('[DOGE] asset balance', assetBalance);

    const sellVolume = assetBalance * sellAllocation;
    const buyVolume = (baseBalance * buyAllocation) / marketPrice;

    const totalSold = sellVolume * sellPrice; // of BUSD
    const totalBought = buyVolume * buyPrice; // of BUSD

    console.log(`
        Tick for ${market}...
        Limit sell order for ${sellVolume}@${sellPrice}=${totalSold}
        Limit buy order for ${buyVolume}@${buyPrice}=${totalBought}
    `);

    // TODO: enable real trading if deal size is more than 10 USD
    // await binanceClient.createLimitSellOrder(market, sellVolume, sellPrice);
    // await binanceClient.createLimitBuyOrder(market, buyVolume, buyPrice);
};

const run = () => {
    const config = {
        asset: 'DOGE',
        base: 'BUSD',
        spread: 0.03, // { 0-1 } percentage of fluctuation to trigger limit order
        buyAllocation: 0.2, // { 0-1 } percentage of how much of the base balance to allocate for the buy order
        sellAllocation: 0.25, // { 0-1 } percentage of how much of the asset balance to allocate for the sell order
        tickInterval: 15000, // ms
    };

    const binanceClient = new ccxt.binance({
        apiKey: 'hw28TMrYkJvLFYLTTPsGDBZH9MJOfVIwwaCCDFMktO3evJUQw6eokSLSp0X8T5u3', // TODO: process.env.API_KEY,
        secret: 'LA6DSgTlNDpPUOrfjDHjSyxNmU4bP20EY7pjQ5TyRZxFa1LhC0lApmR6RgIVAizt', // TODO: process.env.API_SECRET,
    });

    tick(config, binanceClient);

    // TODO: enable continous trading
    setInterval(tick, config.tickInterval, config, binanceClient);
};

/** invoke crypto trading bot */
run();