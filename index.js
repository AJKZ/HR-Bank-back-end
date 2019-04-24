//import * as corsMiddleware from "restify-cors-middleware"
const corsMiddleware = require('restify-cors-middleware');
const restify = require('restify');
const mongoose = require('mongoose');

const server = restify.createServer({
    name: 'bank_back-end',
    version: '1.1.0'
});

const cors = corsMiddleware({
    origins: ["*"],
    allowHeaders: ['Authorization'],
    exposeHeaders: ['Authorization']
});

server.pre(cors.preflight);
server.use(cors.actual);
server.use(restify.plugins.bodyParser());

mongoose.connect('mongodb://localhost:27017/test', {useNewUrlParser: true});

const User = mongoose.model('User', { 
    iban: String,
    pin: String,
    balance: Number
});

server.post('/login', (req, res, next) => {
    const iban = req.body.iban
    const pin = req.body.pin

    return User.findOne({$and: [{iban: iban}, {pin: pin}]})
        .then(function handleResult(result) {
            if(result == null) {
                res.send(403, 'invalid login')
            }
            else {
                res.send(200, 'successful login')
            }

            res.send(200)
        });

    console.log(iban, pin)
    res.send(200, 'success')
});

server.post('/getbalance', (req, res, next) => {
    const iban = req.body.iban
    const pin = req.body.pin

    return User.findOne({$and: [{iban: iban}, {pin: pin}]})
    .then((result) => {
        res.send(200, result.balance);
    })
    .catch(function handleWithdrawError(error) {
        res.send(500, error)
    });
});

server.post('/withdraw', (req, res, next) => {
    const iban = req.body.iban
    const amount = req.body.amount

    User.findOneAndUpdate({ iban: iban }, { $inc: { balance: -amount } }, { new: true })
        .then(function handleWithdrawResult(result) {
            res.send(200, result);
        })
        .catch(function handleWithdrawError(error) {
            res.send(500, error)
        });
});

/*
server.post('/deposit', function (req, res, next) {
    const iban = req.body.iban
    const amount = req.body.amount

    return User.findOneAndUpdate({iban: iban}, {$inc: {balance: amount}}, {new: true})
        .then(function handleUpdateResult(result) {
            res.send(200, result)
        });
});
*/

server.listen(8080, () => {
    console.log('%s listening at %s', server.name, server.url);
});