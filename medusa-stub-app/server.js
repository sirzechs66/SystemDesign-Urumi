const express = require("express");
const { v4: uuid } = require("uuid");

const app = express();
app.use(express.urlencoded({ extended: true }));

const orders = [];

app.get("/health", (_, res) => res.send("ok"));

app.get("/", (_, res) => {
  res.send(`
    <h1>Medusa Store</h1>
    <p>Product: Demo Item</p>
    <form method="POST" action="/checkout">
      <button type="submit">Checkout</button>
    </form>
  `);
});

app.post("/checkout", (_, res) => {
  const id = uuid();
  orders.push({ id, createdAt: new Date().toISOString() });
  res.send(`Order placed: ${id}`);
});

app.get("/admin/orders", (_, res) => {
  res.json(orders);
});

app.listen(9000, "0.0.0.0", () => {
  console.log("Medusa store running on 9000");
});
