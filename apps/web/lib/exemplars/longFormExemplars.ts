import { Niche } from "./shortFormExemplars";

export type LongFormExemplar = {
  niche: Niche;
  text: string;
};

export const longFormExemplars: LongFormExemplar[] = [
  {
    niche: "operator_lessons",
    text: `small teams don’t win because they’re scrappy.

they win because they’re aligned.

in large orgs:
– decisions get socialized
– ownership gets blurry
– speed dies quietly

clarity > headcount.`
  },

  {
    niche: "build_in_public",
    text: `building in public sounds cool until:

– you ship something mid
– someone roasts it
– doubt creeps in

but shipping publicly forces momentum.

you can’t hide.
you can’t stall.

and that’s the point.`
  },

  {
    niche: "technical_insight",
    text: `if your AI app feels robotic, it's usually:

1. over-constrained prompt
2. no real exemplars
3. low temperature

it's rarely the model alone.`
  },

  {
    niche: "social_observation",
    text: `everyone wants to build in public.

few want to look early.

we love polished launches.

we hate awkward v1s.

but early is where leverage lives.`
  }
];