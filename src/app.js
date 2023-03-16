const express = require('express');
const bodyParser = require('body-parser');
const { Op, Sequelize } = require("sequelize");
const {sequelize} = require('./model')
const {getProfile} = require('./middleware/getProfile')
const app = express();
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('../swagger.json');

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

/**
 * FIX ME!
 * @returns contract by id
 */
app.get('/contracts/:id',getProfile ,async (req, res) =>{
    const {Contract} = req.app.get('models')
    const {id} = req.params
    try {
        const contract = await Contract.findOne({where: {id}})
        console.log(contract)
        if(!contract) return res.status(404).end()
        res.json(contract)
    } catch (error){
        console.log("Error occurred while getting contracts"+ error)
    }
})

app.get('/contracts',async (req, res) =>{
    try {
        const {Contract} = req.app.get('models')
        contracts = await Contract.findAll({
            where: {
                status: {
                    [Op.ne]: 'terminated'
                }
            }
        })
        res.json(contracts)
    } catch (error){
        console.log("Error occurred while getting contracts "+ error)
    }
})


app.get('/jobs/unpaid',async (req, res) =>{
    try {
        const {Job} = req.app.get('models')
        contracts = await Job.findAll({
            where: {
                paid: {
                    [Op.is]: null
                }
            }
        })
        res.json(contracts)
    } catch (error){
        console.log("Error occurred while getting unpaid jobs "+ error)
    }
})

app.post('/jobs/:job_id/pay',async (req, res) =>{
    try {
        const {Job} = req.app.get('models')
        job_details = await Job.findOne({
            where: {
                id: req.params.job_id
            }
        })
        job_price = job_details.price

        const contract_details = await job_details.getContract()
        const client_details = await contract_details.getClient()
        client_balance = client_details.balance

        if (client_balance >= job_price) {
            const contractor_details = await contract_details.getContractor()
            client_new_balance = client_balance - job_price
            contractor_new_balance = contractor_details.balance + job_price
            const {Profile} = req.app.get('models')
            const result = await sequelize.transaction(async (t) => {
                await Profile.update({ balance: client_new_balance }, {
                    where: {
                        type: 'client'
                    }
                });
                
                await Profile.update({ balance: contractor_new_balance }, {
                    where: {
                        type: 'contractor'
                    }
                });
            });

            res.json("contract details have been updated successfully")  
        } else {
            res.json("Client doesn't have enough balance to pay")
        }  
    } catch (error){
        console.log("Error occurred while updaing balance "+ error)
    } 
})

app.post('/balances/deposit/:userId',async (req, res) =>{
    try {
        var contract_ids = new Array()
        const {Contract, Job, Profile} = req.app.get('models')
        const user_id = req.params.userId
        var deposit_amount = req.body.depositAmount
        
        contract_details = await Contract.findAll({
            where: {
                ClientId: user_id
            }
        })
        for(var contract of contract_details) {
            contract_ids.push(contract.id)
        }
        price_details = await Job.findOne({
            attributes : [[Sequelize.fn('SUM', Sequelize.col('Job.price')), 'totalPrice']],
            where: {
                ContractId: {
                    [Op.in]: contract_ids
                }
            }
        })
        allowable_amount = price_details.dataValues.totalPrice * 0.25
        if (deposit_amount <= allowable_amount){
            await Profile.update({ balance: deposit_amount }, {
                where: {
                    id: user_id
                }
            });
            res.json("Amount credited to your balance successfully")
        }else{
            res.json("Deposit amount is greater than allowable limit: "+ allowable_amount)
        }
    } catch (error){
        console.log("Error occurred while depositing amount"+ error)
    }
})


app.get('/admin/best-profession',async (req, res) =>{
    try {
        var date_range = new Array()
        date_range.push(req.query.start)
        date_range.push(req.query.end)
        if(req.query.start === undefined || req.query.end === undefined){
            return res.status(400).end()
        }
        
        const {Job} = req.app.get('models')
        job_details = await Job.findOne({
            order: [
                [sequelize.fn('max', sequelize.col('Job.price')), 'DESC']
            ],
            attributes : [
                'ContractId',
                [Sequelize.fn('SUM', Sequelize.col('Job.price')), 'totalPrice']
            ],
            group: 'ContractId',
            where: {
                paid: true,
                paymentDate: {
                    [Op.between]: date_range 
                }
            }
        })
        const contract = await job_details.getContract()
        const profile = await contract.getContractor()
        res.json(profile)
    } catch (error){
        console.log("Error occurred while getting profiles"+ error)
    }
})
 
app.get('/admin/best-clients',async (req, res) =>{
    try {
        if(req.query.start === undefined || req.query.end === undefined){
            return res.status(400).end()
        }
        var date_range = new Array()
        var clients_list = new Array()
        var limit_records = req.query.limit
        date_range.push(req.query.start)
        date_range.push(req.query.end)
            
        const {Job} = req.app.get('models')
        job_details = await Job.findAll({
            limit: limit_records,
            order: [
                [sequelize.fn('max', sequelize.col('Job.price')), 'DESC']
            ],
            attributes : [
                'ContractId',
                [Sequelize.fn('SUM', Sequelize.col('Job.price')), 'totalPrice']
            ],
            group: 'ContractId',
            where: {
                paid: true,
                paymentDate: {
                    [Op.between]: date_range 
                }
            }
        })
        for(var job of job_details){
            contract = await job.getContract()
            client = await contract.getClient()
            clients_list.push(client)
        }
    
        res.json(clients_list)
    } catch (error){
        console.log("Error occurred while getting profiles"+ error)
    }
})

module.exports = app;
