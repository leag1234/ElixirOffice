const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const upstream = process.env.EO_UPSTREAM || path.join(require('node:os').homedir(), 'elixiroffice/DocumentServer');
const web = process.env.EO_WEB_APPS || path.join(upstream, 'web-apps');
const source = fs.readFileSync(path.join(web, 'apps/common/main/lib/elixir-ai/Core.js'), 'utf8');

function load(fetch, timers) {
  const window = {eoDesktopAI: {fetch, configured: () => true}};
  const context = {window, define: (_d, factory) => factory(window), performance, console, AbortController, TextDecoder, TextEncoder};
  if (timers) {
    context.setTimeout = (fn, delay) => { const id = timers.size + 1; timers.set(id, {fn, delay}); return id; };
    context.clearTimeout = id => timers.delete(id);
  } else {
    context.setTimeout = setTimeout;
    context.clearTimeout = clearTimeout;
  }
  vm.runInNewContext(source, context);
  return window.Common.ElixirAI;
}
function response(body, init) {
  const r = {ok: !((init || {}).status >= 400), status: 200, ...init, headers: {get: () => (init && init.ctype) || 'application/json'}, body: body && typeof body.getReader === 'function' ? body : null, json: () => Promise.resolve(body), text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))};
  r.clone = () => r;
  return r;
}
function stream(chunks, delay = 0) {
  let i = 0;
  return {getReader: () => ({read: () => new Promise((resolve, reject) => {
    if (i >= chunks.length) return resolve({done: true});
    const value = new TextEncoder().encode(chunks[i++]);
    setTimeout(() => resolve({done: false, value}), delay);
  })})};
}
const settings = {endpoint: 'http://localhost:1234/v1', model: 'qwen', apiKey: '', sampling: 'default'};

test('endpoint errors use the panel strings', async () => {
  const AI = load(async () => response({message: 'Unexpected endpoint'}));
  AI.Strings = {fr: {unexpectedEndpoint: 'L’URL doit se terminer par /v1.'}};
  AI.getLang = () => 'fr';
  await assert.rejects(AI.Connector.chat({settings, messages: []}), /L’URL doit se terminer par \/v1\./);
});

test('named tool_choice 400 retries once as required with only that tool', async () => {
  const requests = [];
  const AI = load(async (url, init) => {
    requests.push(JSON.parse(init.body));
    if (requests.length === 1) return response({error: {message: 'invalid tool_choice value'}}, {status: 400});
    return response({choices: [{message: {role: 'assistant', content: ''}, finish_reason: 'stop'}]});
  });
  await AI.Connector.chat({settings, messages: [], tools: [{type: 'function', function: {name: 'submit_plan'}}, {type: 'function', function: {name: 'other'}}], toolChoice: {type: 'function', function: {name: 'submit_plan'}}});
  assert.equal(requests.length, 2);
  assert.equal(requests[1].tool_choice, 'required');
  assert.deepEqual(requests[1].tools.map(t => t.function.name), ['submit_plan']);
});

test('parses Qwen XML tool blocks only when tool_calls is empty', async () => {
  const AI = load(async () => response({choices: [{message: {role: 'assistant', content: '<function=replace_text><parameter=text>hi</parameter></function>'}}]}));
  const one = await AI.Connector.chat({settings, messages: []});
  assert.ok(one.message.tool_calls, 'expected parsed tool call');
  assert.equal(one.message.tool_calls[0].function.name, 'replace_text');
  assert.deepEqual(JSON.parse(one.message.tool_calls[0].function.arguments), {text: 'hi'});
  const AI2 = load(async () => response({choices: [{message: {role: 'assistant', tool_calls: [{id: 'native', function: {name: 'native', arguments: '{}'}}]}}]}));
  const two = await AI2.Connector.chat({settings, messages: []});
  assert.ok(two.message.tool_calls, 'expected native tool call');
  assert.equal(two.message.tool_calls[0].function.name, 'native');
});

test('parses Qwen JSON tool blocks only when tool_calls is empty', async () => {
  const AI = load(async () => response({choices: [{message: {role: 'assistant', reasoning: '<tool_call>{"name":"replace_text","arguments":{"text":"hi"}}</tool_call>'}}]}));
  const one = await AI.Connector.chat({settings, messages: []});
  const AI2 = load(async () => response({choices: [{message: {role: 'assistant', tool_calls: [{id: 'native', function: {name: 'native', arguments: '{}'}}]}}]}));
  const two = await AI2.Connector.chat({settings, messages: []});
  assert.ok(two.message.tool_calls, 'expected native tool call');
  assert.equal(two.message.tool_calls[0].function.name, 'native');
});

test('parses streamed reasoning tool blocks and keeps active streams alive', async () => {
  const AI = load(async () => response(stream([
    'data: {"choices":[{"delta":{"reasoning_content":"<function=insert_text><parameter=text>hello</parameter></function>"}}]}\n\n',
    ': keep-alive\n\n',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
  ], 20), {ctype: 'text/event-stream'}));
  const result = await AI.Connector.chat({settings, messages: []});
  assert.equal(result.message.tool_calls[0].function.name, 'insert_text');
  assert.deepEqual(JSON.parse(result.message.tool_calls[0].function.arguments), {text: 'hello'});
});

test('clear endpoint and context errors', async () => {
  const AI = load(async () => response({message: 'Unexpected endpoint'}));
  await assert.rejects(AI.Connector.chat({settings, messages: []}), /must end with \/v1/);
  const AI2 = load(async () => response({error: {message: 'n_keep 100 >= n_ctx 64'}}, {status: 400}));
  await assert.rejects(AI2.Connector.chat({settings, messages: []}), /at least 16K tokens/);
});

test('failed rollback is verified and reported instead of silently claiming success', async () => {
  const AI = load(async () => response({choices: [{message: {role: 'assistant', tool_calls: [{id: 'call', function: {name: 'edit', arguments: '{}'}}]}}]}));
  const calls = [];
  const result = await AI.Orchestrator.run({
    instruction: 'x', settings, signal: null,
    toolset: {
      id: 'test', tools: [], systemPrompt: () => '', userMessage: () => '',
      init: async () => ({context: {blocks: []}}), scopeInfo: () => ({}),
      isMutating: () => true, begin: async () => { calls.push('begin'); }, execute: async () => ({ok: true}),
      end: async () => { calls.push('end'); return {ok: false}; },
      verifyRollback: async () => { calls.push('verify'); return false; },
      validate: () => null
    }
  });
  assert.deepEqual(calls, ['begin', 'end', 'verify']);
  assert.equal(result.ok, false);
  assert.equal(result.rollbackUnverified, true);
  assert.equal(result.changed, true);
});

test('a verified rollback after a late failure is reported explicitly', async () => {
  const AI = load(async () => response({choices: [{message: {role: 'assistant', tool_calls: [{id: 'call', function: {name: 'edit', arguments: '{}'}}]}}]}));
  const result = await AI.Orchestrator.run({
    instruction: 'x', settings, signal: null,
    toolset: {
      id: 'test', tools: [], systemPrompt: () => '', userMessage: () => '',
      init: async () => ({context: {blocks: []}}), scopeInfo: () => ({}),
      isMutating: () => true, begin: async () => {}, execute: async () => ({ok: true}),
      end: async () => ({}), verifyRollback: async () => true, validate: () => null
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.rollbackUnverified, false);
  assert.match(result.error.message, /rolled back and verified/);
});

test('clears the total request timer when a response finishes', async () => {
  const timers = new Map();
  const AI = load(() => new Promise(resolve => setTimeout(() => resolve(response({choices: [{message: {role: 'assistant', content: 'ok'}}]})), 5)), timers);
  const finished = AI.Connector.chat({settings, messages: []});
  await new Promise(resolve => setImmediate(resolve));
  const totalTimer = [...timers.values()].find(timer => timer.delay === 20 * 60 * 1000);
  assert.ok(totalTimer, 'expected a local total-limit timer');
  await finished;
  assert.equal([...timers.values()].filter(timer => timer.delay === 20 * 60 * 1000).length, 0);
});
