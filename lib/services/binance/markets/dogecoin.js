const dogecoin = {
    base: 'BUSD',
    asset: 'DOGE',
    buySpread: 0.015, // { 0-1 } asset price drop to trigger buy limit order
    sellSpread: 0.015, // { 0-1 } asset price rise to trigger sell limit order
    buyAllocation: 0.085, // { 0-1 } how much of the base balance to allocate for the buy order
    sellAllocation: 0.1538, // { 0-1 } how much of the asset balance to allocate for the sell order
    minBuyOrderVolume: 12.50, // minimum BUY order volume to allocate in notional currency (BUSD)
    minSellOrderVolume: 11.00, // minimum SELL order volume to allocate in notional currency (BUSD)
    minSellOrdersToKeep: 5.5, // how many notional SELL orders always to keep (minSellOrderVolume * minSellOrdersToKeep)
    tickInterval: 60 * 1000, // ms
};


export default dogecoin;
