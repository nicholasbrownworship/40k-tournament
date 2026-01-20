import { standings } from './tournament.js';

export function renderPlayers(state){
  const ul = document.getElementById('playersList');
  ul.innerHTML = '';
  state.players.forEach(p=>{
    const li = document.createElement('li');
    li.textContent = `${p.name} — ${p.faction}`;
    ul.appendChild(li);
  });
}

export function renderPairings(state){
  const div = document.getElementById('pairings');
  div.innerHTML = '';
  const r = state.rounds.at(-1);
  if(!r) return;
  r.pairings.forEach(p=>{
    const d = document.createElement('div');
    d.textContent = `${p.a} vs ${p.b}`;
    div.appendChild(d);
  });
}

export function renderStandings(state){
  const ol = document.getElementById('standings');
  ol.innerHTML = '';
  standings(state).forEach(p=>{
    const li = document.createElement('li');
    li.textContent = p.name;
    ol.appendChild(li);
  });
}
