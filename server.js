const express = require('express');
const path = require('path');
const app = express();
const port = 3001;

app.use(express.static(path.join(__dirname, 'client/build')));

app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
