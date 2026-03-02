export type Niche =
  | "build_in_public"
  | "operator_lessons"
  | "technical_insight"
  | "project_showcase"
  | "social_observation";

export type ShortFormExemplar = {
  niche: Niche;
  text: string;
};

export const shortFormExemplars: ShortFormExemplar[] = [
  // BUILD IN PUBLIC
  {
    niche: "build_in_public",
    text: `shipped the ugly version today.

not proud of it.

but progress > aesthetics.`
  },
  {
    niche: "build_in_public",
    text: `i used to wait until something felt impressive.

now i ship when it's useful.

massive difference.`
  },

  // OPERATOR LESSONS
  {
    niche: "operator_lessons",
    text: `clarity scales.

headcount doesn't.`
  },
  {
    niche: "operator_lessons",
    text: `most growth problems are focus problems wearing a marketing costume.`
  },

  // TECHNICAL INSIGHT
  {
    niche: "technical_insight",
    text: `most AI apps feel robotic.

not because of the model.

because of the scaffolding.`
  },

  // PROJECT SHOWCASE
  {
    niche: "project_showcase",
    text: `just shipped a chrome extension.

no funding.
no team.

just shipping.`
  },

  // SOCIAL OBSERVATION
  {
    niche: "social_observation",
    text: `attention is cheap.

consistency is rare.`
  }
];