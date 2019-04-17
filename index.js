const restify = require('restify');
const mongoose = require('mongoose');

const server = restify.createServer({
    name: 'bank_back-end',
    version: '1.1.0'
});

server.use(restify.plugins.bodyParser());

mongoose.connect('mongodb://localhost:27017/test', {useNewUrlParser: true});

const User = mongoose.model('User', { 
    iban: String,
    pin: String,
    balance: Number
});

server.post('/login', async (req, res, next) => {
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
        })

    console.log(iban, pin)
    res.send(200, 'success')
});

server.post('/withdraw', async (req, res, next) => {
    const iban = req.body.iban
    const amount = req.body.amount

    const result = await User.findOneAndUpdate({ iban: iban }, { $inc: { balance: -amount } }, { new: true });
    res.send(200, result);
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