-- Department-level feedback templates and structured session feedback answers

ALTER TABLE public.departments
ADD COLUMN IF NOT EXISTS feedback_form_fields JSONB;

UPDATE public.departments
SET feedback_form_fields = $json$
[
  {
    "id": "teaching_objectives",
    "type": "rating",
    "label": "How well were the teaching objectives outlined and delivered?",
    "required": true,
    "commentLabel": "Any further comments on teaching objectives outline or delivery?"
  },
  {
    "id": "learner_engagement",
    "type": "rating",
    "label": "How well did the teacher engage the learners?",
    "required": true,
    "commentLabel": "Any further comments on engaging learners?"
  },
  {
    "id": "session_structure",
    "type": "rating",
    "label": "How well did the teacher structure their session?",
    "required": true,
    "commentLabel": "Any further comments on structure?"
  },
  {
    "id": "group_participation",
    "type": "rating",
    "label": "How well did the teacher use group participation/ interaction?",
    "required": true,
    "commentLabel": "Any further comments on group participation/ interaction?"
  },
  {
    "id": "teaching_methodology",
    "type": "rating",
    "label": "How well did the teacher use teaching style and methodology?",
    "required": true,
    "commentLabel": "Any further comments on teaching style or methodology?"
  },
  {
    "id": "additional_comments",
    "type": "textarea",
    "label": "Any additional comments?",
    "required": false,
    "placeholder": "Add any final observations here..."
  }
]
$json$::jsonb
WHERE feedback_form_fields IS NULL;

ALTER TABLE public.departments
ALTER COLUMN feedback_form_fields SET DEFAULT $json$
[
  {
    "id": "teaching_objectives",
    "type": "rating",
    "label": "How well were the teaching objectives outlined and delivered?",
    "required": true,
    "commentLabel": "Any further comments on teaching objectives outline or delivery?"
  },
  {
    "id": "learner_engagement",
    "type": "rating",
    "label": "How well did the teacher engage the learners?",
    "required": true,
    "commentLabel": "Any further comments on engaging learners?"
  },
  {
    "id": "session_structure",
    "type": "rating",
    "label": "How well did the teacher structure their session?",
    "required": true,
    "commentLabel": "Any further comments on structure?"
  },
  {
    "id": "group_participation",
    "type": "rating",
    "label": "How well did the teacher use group participation/ interaction?",
    "required": true,
    "commentLabel": "Any further comments on group participation/ interaction?"
  },
  {
    "id": "teaching_methodology",
    "type": "rating",
    "label": "How well did the teacher use teaching style and methodology?",
    "required": true,
    "commentLabel": "Any further comments on teaching style or methodology?"
  },
  {
    "id": "additional_comments",
    "type": "textarea",
    "label": "Any additional comments?",
    "required": false,
    "placeholder": "Add any final observations here..."
  }
]
$json$::jsonb;

ALTER TABLE public.departments
ALTER COLUMN feedback_form_fields SET NOT NULL;

ALTER TABLE public.session_feedback
ADD COLUMN IF NOT EXISTS answers JSONB;

UPDATE public.session_feedback
SET answers = '[]'::jsonb
WHERE answers IS NULL;

ALTER TABLE public.session_feedback
ALTER COLUMN answers SET DEFAULT '[]'::jsonb;

ALTER TABLE public.session_feedback
ALTER COLUMN answers SET NOT NULL;
