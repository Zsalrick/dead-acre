# Dead Acre

Böngészős, CoD-zombis hangulatú FPS túlélőjáték Borderlands/Division-stílusú zsákmánnyal (Three.js, sima HTML + JS, build nélkül).

**Játék:** https://zsalrick.github.io/dead-acre/

## Csapatjáték (P2P)

1. A bázison, a **Munkák** fülön: **Csapat létrehozása** – kapsz egy 5 betűs kódot.
2. A barátod ugyanott beírja a kódot, és **Csatlakozás kóddal**.
3. A csapatvezető elvállal egy munkát, a többieknél automatikusan indul.

Nem kell fiók vagy bejelentkezés: a böngészők a [PeerJS](https://peerjs.com/) ingyenes szerverén találják meg egymást, utána közvetlenül (WebRTC) beszélgetnek. Nagyon szigorú hálózatok (egyes céges vagy mobilhálózatok) blokkolhatják a közvetlen kapcsolatot.

## Helyi futtatás

Bármilyen statikus szerverrel, pl.:

```bash
python -m http.server 8000
```

majd http://localhost:8000

## Irányítás

WASD mozgás · Shift sprint · bal egér lövés · jobb egér célzás · R újratöltés · E használat · F felvétel (nyomva: csere) · I / Tab leltár · C kasztképesség · H/G/Q/X tárgyak · V kés
