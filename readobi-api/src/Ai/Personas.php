<?php
/**
 * ALG Company - Miss Algorithm Personas & Prompt Builder
 *
 * Single source of truth for the M5 "ONE BRAIN, every persona" contract on the
 * PHP side. Mirrors alg-school-os-ai/app/brain/personas.py so the persona layer
 * behaves identically whether traffic flows to Groq (interim, live today) or
 * to the Miss Algorithm Python microservice (AI_PROVIDER=python).
 *
 * Provides:
 * - Persona registry (student_tutor, tech_tutor, teacher_copilot,
 *   principal_analyst, parent_assistant, generic)
 * - ai_instruction context injection (context-aware, not a generic chatbot)
 * - Anti-cheat guidance ladder for "do my assignment" style requests
 */

namespace Alg\Ai;

class Personas {

    // Guidance ladder rungs. Server-side decision only -- the model receives the
    // ladder and follows it one rung at a time.
    private const LADDER = [
        'Explanation', 'Hint', 'Example', 'Guided practice', 'Student solution'
    ];

    // Regexes that flag a "do my assignment / build it for me" ask.
    private const DO_IT_FOR_ME = [
        '/\b(do|write|solve|complete|finish|answer)\s+(my|this|this whole|the)\s+(assignment|homework|essay|exercise|worksheet|problem|test|exam)(\s+for me)?\b/i',
        '/\bdo\s+it\s+for\s+me\b/i',
        '/\bjust\s+give\s+me\s+the\s+(answer|answers|solution|solutions)\b/i',
        '/\b(paste|copy)\s+(the\s+)?(answer|solution)\s*(here|below)?\b/i',
    ];

    private const BUILD_IT_FOR_ME = [
        '/\b(build|create|make|develop|code)\s+(my|a|an|the)\s+(website|app|project|product|landing page)(\s+for me)?\b/i',
    ];

    private const PERSONAS = [
        'generic' => [
            'display' => 'Miss Algorithm',
            'prompt'  => "You are Miss Algorithm, the AI brain of ALG School OS. "
                . "You are friendly, precise and age-appropriate. Always answer in "
                . "plain language and teach rather than merely answer.\n"
                . "Teaching context (may be empty): {context}",
            'slots'   => ['context'],
        ],
        'student_tutor' => [
            'display' => 'Student Tutor',
            'prompt'  => "You are Miss Algorithm, a supportive tutor for a school student. "
                . "Meet the student at their level, never solve their homework outright, "
                . "and follow the guidance ladder for 'do my assignment' requests.\n"
                . "Current course: {course}\n"
                . "Current lesson: {lesson}\n"
                . "Lesson objectives: {objectives}\n"
                . "Student profile: {student}",
            'slots'   => ['course', 'lesson', 'objectives', 'student'],
        ],
        'tech_tutor' => [
            'display' => 'Tech Tutor (AI Tutor of the Future)',
            'prompt'  => "You are Miss Algorithm, the AI tutor of the future. You teach "
                . "practical digital and tech skills the ALG way: Learn -> Practice -> "
                . "Build -> Prove. Every lesson ends with the learner building a real "
                . "artifact, guided step-by-step, never done for them. If they ask you to "
                . "build it for them, coach instead: break the task down, give one step at "
                . "a time, and let them type the final code.\n"
                . "Course: {course}\n"
                . "ALG category: {category}\n"
                . "Level: {level}\n"
                . "Learner profile: {student}",
            'slots'   => ['course', 'category', 'level', 'student'],
        ],
        'teacher_copilot' => [
            'display' => 'Teacher Copilot',
            'prompt'  => "You are Miss Algorithm acting as a teacher copilot for an "
                . "experienced educator. Produce ready-to-use lesson drafts, activities "
                . "and differentiation plans (weak / average / advanced). Be concise and "
                . "practical for the classroom.\n"
                . "Course: {course}\n"
                . "Lesson: {lesson}\n"
                . "Objectives: {objectives}",
            'slots'   => ['course', 'lesson', 'objectives'],
        ],
        'principal_analyst' => [
            'display' => 'Principal / School Analyst',
            'prompt'  => "You are Miss Algorithm, the school analyst for the principal. "
                . "Summarize data-driven trends, flag anomalies and end with 'What needs "
                . "my attention' items. Stay factual, do not invent numbers.\n"
                . "Context: {context}",
            'slots'   => ['context'],
        ],
        'parent_assistant' => [
            'display' => 'Parent Assistant',
            'prompt'  => "You are Miss Algorithm assisting a parent using data they are "
                . "authorized to see. Never disclose other students' data. If required "
                . "information is missing, say so clearly.\n"
                . "Context: {context}",
            'slots'   => ['context'],
        ],
    ];

    /**
     * Resolve the persona key from an explicit value, a model suffix
     * ('miss-algorithm-v1:tech_tutor') or the instruction block.
     */
    public static function resolveKey(?string $model = null, ?array $instruction = null): string {
        if (is_array($instruction)) {
            $fromInstruction = strtolower(trim((string)($instruction['persona'] ?? '')));
            if (isset(self::PERSONAS[$fromInstruction])) {
                return $fromInstruction;
            }
        }

        if (!empty($model)) {
            $pos = strpos($model, ':');
            if ($pos !== false) {
                $suffix = strtolower(trim(substr($model, $pos + 1)));
                if (isset(self::PERSONAS[$suffix])) {
                    return $suffix;
                }
            }
        }

        return 'generic';
    }

    /**
     * Build the server-owned system prompt for a persona + ai_instruction context.
     */
    public static function systemPrompt(string $persona, ?array $instruction = null): string {
        $persona = isset(self::PERSONAS[$persona]) ? $persona : 'generic';
        $template = self::PERSONAS[$persona]['prompt'];
        $context = is_array($instruction) ? $instruction : [];

        $slots = [];
        foreach (['context', 'course', 'lesson', 'objectives', 'student', 'category', 'level'] as $slot) {
            $value = $context[$slot] ?? null;
            $slots[$slot] = self::toText($value) ?: '(not provided)';
        }

        $prompt = $template;
        foreach ($slots as $slot => $value) {
            $prompt = str_replace('{' . $slot . '}', $value, $prompt);
        }
        // Strip any unresolved braces defensively.
        $prompt = str_replace(['{', '}'], ['(', ')'], $prompt);

        $ladder = self::antiCheatGuidance($context['last_user_message'] ?? null);
        if ($ladder !== '') {
            $prompt = $prompt . "\n\n" . $ladder;
        }

        return $prompt;
    }

    /**
     * Anti-cheat guidance ladder when the latest user message looks like a
     * "do my assignment / build it for me" request.
     */
    public static function antiCheatGuidance(?string $lastUserMessage): string {
        if (empty($lastUserMessage)) {
            return '';
        }

        $hit = false;
        foreach (array_merge(self::DO_IT_FOR_ME, self::BUILD_IT_FOR_ME) as $pattern) {
            if (preg_match($pattern, $lastUserMessage)) {
                $hit = true;
                break;
            }
        }
        if (!$hit) {
            return '';
        }

        $lines = [];
        foreach (self::LADDER as $i => $rung) {
            $lines[] = ($i + 1) . '. ' . $rung;
        }

        return "The student asked for help with an assignment. Teach, do not deliver "
            . "the answer. Follow this ladder strictly, one rung at a time:\n"
            . implode("\n", $lines);
    }

    private static function toText($value): string {
        if ($value === null) {
            return '';
        }
        if (is_string($value)) {
            return trim($value);
        }
        if (is_scalar($value)) {
            return (string)$value;
        }
        return '';
    }
}