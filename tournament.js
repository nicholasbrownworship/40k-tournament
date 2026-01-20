export function standings(state){
  return [...state.players].sort((a,b)=>a.name.localeCompare(b.name));
}

export function nextRound(state){
  const round = {
    number: state.rounds.length + 1,
    pairings: []
  };
  const shuffled = [...state.players].sort(()=>Math.random()-0.5);
  for(let i=0;i<shuffled.length;i+=2){
    round.pairings.push({
      a: shuffled[i]?.name ?? 'BYE',
      b: shuffled[i+1]?.name ?? 'BYE'
    });
  }
  state.rounds.push(round);
}
