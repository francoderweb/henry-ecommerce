const server = require('express').Router()
const { Op } = require('sequelize')
const { Order, Product, User, Order_product } = require('../db.js')
const { isAuthenticated, isAdmin } = require('./helper')

// Si el req tiene un query Search filtra las ordenes que coincidan con el estado
// Valores validos para el state: 'carrito', 'creada', 'cancelada', 'procesando', 'completa'
server.get('/admin', isAuthenticated, (req, res) => {
  if (req.query.search) {
    Order.findAll({
      where: {
        state: req.query.search,
      },
      include: [
        {
          model: Product,
        },
        {
          model: User,
        },
      ],
    }).then((orders) => res.send(orders))
  } else if (req.query.all) {
    Order.findAll({
      include: [{ model: Product }, { model: User }],
    }).then((orders) => res.send(orders))
  } else {
    Order.findAll().then((orders) => res.send(orders))
  }
})

// Busca el producto por ID y devulve el Producto con sus categorias
server.get('/:id', (req, res) => {
  Order.findOne({
    where: { id: req.params.id },
    include: [
      {
        model: Product,
      },
      {
        model: User,
      },
    ],
  })
    .then((order) => {
      if (!order) return res.status(404).send('Id no válido')
      res.status(200).json(order)
    })
    .catch((err) => res.status(500).send(err))
})

// crear orden completa
server.post('/:userId', async (req, res) => {
  try {
    const order = await Order.findOrCreate({
      where: {
        userId: req.params.userId,
        state: 'completa',
      },
    })
    await Order_product.findOrCreate({
      where: {
        orderId: order[0].id,
        productId: req.body.productId,
        price: req.body.price,
        quantity: req.body.quantity,
      },
    })

    const product = await Order.findOne({
      where: { userId: req.params.userId, state: 'completa' },
      include: [Product],
    })

    res.send(product)
  } catch (error) {
    res.status(500).send(error)
  }
})

server.post('/:userId/c', async (req, res) => {
  try {
    const order = await Order.findOrCreate({
      where: {
        userId: req.params.userId,
        state: 'procesando',
      },
    })
    await Order_product.findOrCreate({
      where: {
        orderId: order[0].id,
        productId: req.body.productId,
        price: req.body.price,
        quantity: req.body.quantity,
      },
    })

    const product = await Order.findOne({
      where: { userId: req.params.userId, state: 'procesando' },
      include: [Product],
    })

    res.send(product)
  } catch (error) {
    res.status(500).send(error)
  }
})

// Busca y devuelve las ordenes del usuario logeado
server.get('/user/me', isAuthenticated, (req, res) => {
  Order.findAll({
    where: {
      userId: req.user.id,
      [Op.or]: [
        { state: 'procesando' },
        { state: 'completa' },
        { state: 'cancelada' },
      ],
    },
    include: [{ model: Product }, { model: User }],
  })
    .then((order) => res.send(order))
    .catch((err) => res.status(500).send(err))
})

// Chequea y modifica stocks

server.post('/user/checkout', isAuthenticated, async (req, res) => {
  try {
    const order = await Order.findOne({
      where: { userId: req.user.id, state: 'creada' },
      include: { model: Product },
    })

    const productsPromis = order.products.map((prod) =>
      Product.findByPk(prod.id)
    )
    const productsResolv = await Promise.all(productsPromis)

    let stock = true

    productsResolv.forEach((prod, i) => {
      if (prod.stock < order.products[i]['order_product']['quantity']) {
        stock = false
      }
    })

    if (stock) {
      const updateProducts = productsResolv.map((prod, i) =>
        prod.update({
          stock: prod.stock - order.products[i]['order_product']['quantity'],
        })
      )
      await Promise.all(updateProducts)
      await order.update({ state: 'procesando' })

      res.send('OK')
    } else {
      res.status(500).send('Sin stock')
    }
  } catch (error) {
    res.status(500).send(error)
  }
})

//Cambia estado de ordenes
server.put('/stateChange', async (req, res) => {
  try {
    const order = await Order.findOne({ where: { id: req.body.id } })
    await order.update({ state: req.body.state })
    const newOrders = await Order.findAll({
      include: [{ model: Product }, { model: User }],
    })
    res.send(newOrders)
  } catch (error) {
    res.status(500).send(error)
  }
})
module.exports = server
