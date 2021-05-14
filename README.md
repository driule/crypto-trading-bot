# crypto-trading-bot
Crypto trading bot for Binance

## Project Setup Guide

### Requirements
- `npm ^7.13.0.`
- `node ^16.1.0`

### Build Setup
```bash
# create .env file, fill credentials
$ cp .env.dev .env

# install dependencies
$ npm install

# run trading bot(s)
$ npm start

# setup heroku deployment
$ heroku git:remote -a trading-bot-01
```

### Application entry point
> [lib/index.js](https://github.com/driule/crypto-trading-bot/blob/main/lib/index.js)
