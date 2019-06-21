const corsMiddleware = require('restify-cors-middleware');
const restify = require('restify');
const mongoose = require('mongoose');
require('dotenv').config();

const server = restify.createServer({
    name: 'bank_back-end',
    version: '3.0.0'
});

const cors = corsMiddleware({
    origins: ["*"],
    allowHeaders: ['Authorization'],
    exposeHeaders: ['Authorization']
});

server.pre(cors.preflight);
server.use(cors.actual);
server.use(restify.plugins.bodyParser());

/**CONNECTION */
mongoose.connect('mongodb://localhost:27017/sber', { useNewUrlParser: true })
    .then(() => {
        console.log('connected')
    })
    .catch((error) => {
        console.log(error)
    });

// mongoose.connect('mongodb+srv://AJKZ:<password>@cluster-hr-sber-gpvua.mongodb.net/test?retryWrites=true&w=majority', { useNewUrlParser: true })
//     .then(() => {
//         console.log('connected')
//     })
//     .catch(function handleMongooseError(error) {
//         console.log(error)
//     })

// const { DB_HOST, DB_NAME, DB_USER, DB_PASS } = process.env;
// const connection = `mongodb+srv://${DB_USER}:${DB_PASS}@${DB_HOST}/${DB_NAME}`
// mongoose.connect(connection, { useNewUrlParser: true })
//     .then (() => {
//         console.log('connected')
//     })
//     .catch(function handleMongooseError(error) {
//         console.log(error)
//     });

/* MODELS */
const User = mongoose.model('User', {
    iban: String,
    pin: String,
    attempts: Number,
    balance: Number
});

const Transaction = mongoose.model('Transaction', {
    iban: String,
    amount: Number,
    location: String,
    time: Date
});


/**VARIABLES */
const MAX_LOGIN_ATTEMPTS = 3;


/**VALIDATION */
function validateIban(iban) {
    const ibanUpper = iban.toUpperCase()

    const countryCode = iban.substring(0,2)
    const controlNumber = iban.substring(2,4)
    const bankCode = iban.substring(4,8)
    const bankPassNumber = iban.substring(8,14)

    const countryCodeRotated = ibanUpRot(countryCode)
    const bankCodeRotated = ibanUpRot(bankCode)

    const ibanValidated = calcControlNum(`${bankCodeRotated}${bankPassNumber}${countryCodeRotated}${controlNumber}`)

    if(ibanValidated != 1){
      return false
    }
    return true
}

function ibanUpRot(str) {
    return str.split("")
      .map((v) => v.charCodeAt(0) + 9 - 64)
      .reduce((acc, curr) => {
      return acc += curr.toString()
      })
 }

function calcControlNum(input){
    const ls = (parseInt(input.substring(0, 10)) % 97) * 10 ** 10
    const rs = parseInt(input.substring(10, 20))
    const total = ls + rs
    return total % 97
}


/**REQUEST HANDLING */
server.post('/login', (req, res, next) => {
    const reqIBAN = req.body.iban;
    const reqPIN = req.body.pin;

    // check if IBAN valid
    if(validateIban(reqIBAN) == false) {
        console.log('invalid iban\n');
        res.send(401, 'Invalid IBAN\n');
    }
    else {
        // look for the IBAN and check if it's not blocked
        return User.findOne({$and: [{ iban: reqIBAN }, { attempts: { $lt: MAX_LOGIN_ATTEMPTS } }]})
            .then((result) => {

                console.log('\n[LOG]:[LOGIN]:FIND IBAN AND CHECK ATTEMPTS');
                console.log(result);
                console.log('[LOG]:[LOGIN]:ENDLOG\n');

                User.findOne({$and: [{ iban: reqIBAN }, { pin: reqPIN }]})
                    .then((result) => {

                        console.log('[LOG]:[LOGIN]:FIND IBAN AND PIN COMBINATION');
                        //console.log(result);
                        console.log('[LOG]:[LOGIN]:ENDLOG\n');

                        if(result == null) {

                            console.log('[LOG]:[LOGIN]:IBAN AND PIN COMBINATION NOT FOUND');
                            console.log('[LOG]:[LOGIN]:INCREMENTING ATTEMPTS ON IBAN');
                            console.log('[LOG]:[LOGIN]:ENDLOG\n');

                            User.findOneAndUpdate({$and: [{ iban: reqIBAN }]}, { $inc: { attempts: 1 }})
                                .then((result) => {
                                    console.log('\n[LOG]:[LOGIN]:ATTEMPTS INCREMENTED');
                                    console.log(result);
                                    console.log('[LOG]:[LOGIN]:ENDLOG\n');
                                    res.send(401, 'Incorrect PIN');
                                })
                                .catch((error) => {
                                    console.log('[LOG]:[LOGIN]:ATTEMPTS INCREMENTATION FAILURE');
                                    console.log(error);
                                    console.log('[LOG]:[LOGIN]:ENDLOG\n');
                                })
                        }
                        else {
                            User.findOneAndUpdate({$and: [{ iban: reqIBAN }]}, { attempts: 0 }) 
                            .then((result) => {
                                console.log('[LOG]:[LOGIN]:LOG IN SUCCESS. ATTEMPTS RESET.');
                                console.log('[LOG]:[LOGIN]:ENDLOG\n');
                                res.send(200, result);
                            })
                            .catch((error) => {
                                console.log('[LOG]:[LOGIN]:UNABLE TO FIND IBAN.');
                                console.log(error);
                                console.log('[LOG]:[LOGIN]:ENDLOG\n');
                            });
                        }
                    })
                    .catch((error) => {
                        console.log('\n[LOG]:[LOGIN]:CANNOT CONDUCT SEARCH. DATABASE POSSIBLY OFFLINE.\n');
                        console.log(error);
                        console.log('\n[LOG]:[LOGIN]:ENDLOG\n');
                    })
            })
            .catch((error) => {
                console.log(error);
                res.send(error);
            });
    }
});

server.post('/getbalance', (req, res, next) => {
    const iban = req.body.iban;
    const pin = req.body.pin;

    return User.findOne({$and: [{iban: iban}, {pin: pin}]})
        .then(function handleBalanceResult(result) {
            console.log(result);
            res.send(200, result.balance);
        })
        .catch(function handleBalanceError(error) {
            console.log(error);
            res.send(500, error);
        });
});

server.post('/withdraw', (req, res, next) => {
    const iban = req.body.iban;
    const pin = req.body.pin;
    const amount = req.body.amount;

    User.findOne({$and: [{iban: iban}, {pin: pin}]})
        .then(function withdrawable(user) {
            if(user.balance >= amount) {
                User.findOneAndUpdate({$and: [{ iban: iban }, { pin: pin }]}, { $inc: { balance: -amount } }, { new: true })
                    .then(function handleWithdrawResult() {
                        Transaction.create({
                            iban: iban,
                            amount: amount,
                            location: "SBER-ATM01",
                            time: new Date()
                        })
                        .then(result => {
                            res.send(200, result);
                        })
                    })
                    .catch(function handleWithdrawError(error) {
                        res.send(500, error);
                    });
            }
            else {
                res.send(500, 'Balance too low.\n');
            }
        })
        .catch(function handleError(error) {
            res.send(500, error);
        })
});

/**RUN */
server.listen(8080, () => {
    console.log('%s listening at %s', server.name, server.url);
});
