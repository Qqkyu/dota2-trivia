// https://api.opendota.com/api/heroes

interface Hero {
  id: number;
  name: string;
  localized_name: string;
  primary_attr: string;
  attack_type: string;
  roles: Array<string>;
}

async function getHeroes() {
  const res = await fetch("https://api.opendota.com/api/heroes", {
    cache: "force-cache",
  });
  const heroes: Array<Hero> = await res.json();
  return heroes;
}

export default async function Home() {
  const heroes = await getHeroes();
  return (
    <>
      <h1 className="text-red-500">Dota 2 Trivia</h1>
      <h2>Heroes:</h2>
      {heroes.map((hero) => (
        <pre key={hero.id}>{JSON.stringify(hero, null, 2)}</pre>
      ))}
    </>
  );
}
