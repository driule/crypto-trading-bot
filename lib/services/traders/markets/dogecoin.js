const config = {
    currency: 'usd',
    base: {
        id: 'busd',
        symbol: 'BUSD',
    },
    asset: {
        id: 'dogecoin',
        symbol: 'DOGE',
    },
    buySpread: 0.07, // { 0-1 } asset price drop to trigger buy limit order
    sellSpread: 0.05, // { 0-1 } asset price rise to trigger sell limit order
    buyAllocation: 0.14, // { 0-1 } how much of the base balance to allocate for the buy order
    sellAllocation: 0.10, // { 0-1 } how much of the asset balance to allocate for the sell order
    tickInterval: 60 * 1000, // ms
};


module.exports = {
    dogecoin: config,
};
