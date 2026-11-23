// The rival's own stake of a ranked human Quick Match (online stage 4). Their trophy tag on my result screen is
// drawn only from it: a rival who did not stake (daily limit, a win still saving, a slow line) changes nothing on the
// server, so they get no tag; one who staked from other trophies than the match record gets their real tier.
// users/{uid} rows are readable by every signed-in player (the leaderboards read them too).
//
//   watchRival({ get, clock, uid, mid, found }) -> stop()
//     get(path) -> Promise (a timed read), clock.after(ms, fn); found({ tr0, o }) once the rival's sk names `mid`
//     (tr0 = their trophies before the stake, o = my trophies as their stake holds them). At most 12 looks, 2 s apart.
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function watchRival({ get, clock, uid, mid, found, tries = 12, firstMs = 1500, everyMs = 2000 }) {
  if (!uid || typeof uid !== 'string' || !mid) return () => {};
  let n = 0, stopped = false;
  const look = async () => {
    if (stopped || n++ >= tries) return;
    let v = null;
    try { v = await get(`users/${uid}`); } catch { /* offline: look again */ }
    if (stopped) return;
    const sk = v && v.sk;
    if (sk && sk.b === false && sk.m === mid && isNum(sk.s) && isNum(v.tr)) { stopped = true; found({ tr0: v.tr + sk.s, o: Number(sk.o) || 0 }); return; }
    clock.after(everyMs, look);
  };
  clock.after(firstMs, look);
  return () => { stopped = true; };
}
