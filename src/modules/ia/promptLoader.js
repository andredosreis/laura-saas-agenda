// src/utils/promptLoader.js
const fs = require('fs');
const path = require('path');

function loadSystemPrompt() {
  const promptPath = path.join(__dirname, '..', 'prompt', 'systemLaura.md');
  return fs.readFileSync(promptPath, 'utf8');
}

module.exports = { loadSystemPrompt };