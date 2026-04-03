#!/usr/bin/env python3
"""
Skill Description Trigger Accuracy Evaluator

각 스킬의 description이 트리거 쿼리에 정확히 매칭되는지 측정합니다.
키워드 기반 매칭 시뮬레이션으로 description 최적화 방향을 제시합니다.

Usage:
    python3 run_loop.py                  # 전체 실행
    python3 run_loop.py --skill react-web-development  # 특정 스킬만
    python3 run_loop.py --verbose        # 상세 출력
"""

import json
import re
import sys
from pathlib import Path
from dataclasses import dataclass, field


@dataclass
class MatchResult:
    query: str
    should_trigger: bool
    did_trigger: bool
    matched_keywords: list[str] = field(default_factory=list)

    @property
    def is_correct(self) -> bool:
        return self.should_trigger == self.did_trigger

    @property
    def result_type(self) -> str:
        if self.should_trigger and self.did_trigger:
            return "TP"  # True Positive
        elif self.should_trigger and not self.did_trigger:
            return "FN"  # False Negative (missed trigger)
        elif not self.should_trigger and self.did_trigger:
            return "FP"  # False Positive (wrong trigger)
        else:
            return "TN"  # True Negative


@dataclass
class SkillScore:
    skill_id: str
    description: str
    total: int = 0
    tp: int = 0
    tn: int = 0
    fp: int = 0
    fn: int = 0
    results: list[MatchResult] = field(default_factory=list)

    @property
    def accuracy(self) -> float:
        return (self.tp + self.tn) / self.total if self.total > 0 else 0.0

    @property
    def precision(self) -> float:
        return self.tp / (self.tp + self.fp) if (self.tp + self.fp) > 0 else 0.0

    @property
    def recall(self) -> float:
        return self.tp / (self.tp + self.fn) if (self.tp + self.fn) > 0 else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) > 0 else 0.0


def extract_keywords(description: str) -> list[str]:
    """description에서 트리거 키워드를 추출합니다."""
    # 불용어 제거
    stopwords = {
        "use", "when", "or", "and", "the", "for", "in", "to", "with",
        "also", "triggers", "after", "before", "during", "is", "are",
        "a", "an", "of", "on", "at", "as", "by", "this", "that",
    }

    # description에서 키워드 추출
    words = re.findall(r'[a-zA-Z가-힣]+', description.lower())
    keywords = [w for w in words if w not in stopwords and len(w) > 2]

    # 복합 키워드 추출 (예: "test coverage", "dark mode")
    compound_patterns = [
        r'react\s+\w+', r'typescript\s+\w+', r'tailwind\s+css',
        r'dark\s+mode', r'test\s+coverage', r'code\s+review',
        r'type\s+hints?', r'bare\s+except', r'pass\s*@\s*k',
        r'inline\s+styles?', r'path\s+alias',
        r'agent\s+\w+', r'eval\s+\w+', r'worktree\s+\w+',
    ]
    for pattern in compound_patterns:
        matches = re.findall(pattern, description.lower())
        keywords.extend(matches)

    return list(set(keywords))


def query_matches_description(query: str, keywords: list[str]) -> tuple[bool, list[str]]:
    """쿼리가 description 키워드와 매칭되는지 판단합니다."""
    query_lower = query.lower()
    matched = []

    for keyword in keywords:
        if keyword in query_lower:
            matched.append(keyword)

    # 한국어 키워드 매핑
    ko_mappings = {
        "컴포넌트": ["react", "component", "tsx"],
        "테스트": ["test", "vitest", "coverage"],
        "검증": ["verify", "verification", "check", "validate"],
        "머지": ["merge", "worktree", "squash"],
        "에이전트": ["agent"],
        "평가": ["eval", "benchmark"],
        "빌드": ["build"],
        "린트": ["lint", "eslint"],
        "다크모드": ["dark", "mode"],
        "접근성": ["accessibility", "aria"],
        "스토어": ["zustand", "store"],
        "백엔드": ["backend", "fastapi", "python"],
        "프론트엔드": ["frontend", "react", "dashboard"],
        "타입": ["typescript", "type"],
        "시크릿": ["secret", "hardcoded"],
        "리뷰": ["review"],
        "커밋": ["commit"],
        "디버깅": ["debug"],
        "성능": ["performance"],
        "실패": ["fail", "failure"],
        "트레이스": ["trace", "tracing"],
        "워크트리": ["worktree"],
    }

    for ko_word, en_keywords in ko_mappings.items():
        if ko_word in query_lower:
            for ek in en_keywords:
                if ek in [k.lower() for k in keywords]:
                    matched.append(f"{ko_word}→{ek}")

    # 매칭 임계값: 2개 이상 키워드 매칭 시 트리거
    threshold = 2
    return len(matched) >= threshold, matched


def evaluate_skill(skill_id: str, skill_data: dict, verbose: bool = False) -> SkillScore:
    """단일 스킬의 description 매칭 정확도를 평가합니다."""
    description = skill_data["current_description"]
    keywords = extract_keywords(description)
    score = SkillScore(skill_id=skill_id, description=description)

    for query_data in skill_data["queries"]:
        query = query_data["q"]
        should_trigger = query_data["should_trigger"]

        did_trigger, matched_kw = query_matches_description(query, keywords)

        result = MatchResult(
            query=query,
            should_trigger=should_trigger,
            did_trigger=did_trigger,
            matched_keywords=matched_kw,
        )

        score.results.append(result)
        score.total += 1

        rt = result.result_type
        if rt == "TP":
            score.tp += 1
        elif rt == "TN":
            score.tn += 1
        elif rt == "FP":
            score.fp += 1
        elif rt == "FN":
            score.fn += 1

        if verbose:
            status = "OK" if result.is_correct else "MISS"
            print(f"  [{status}] {rt} | {query} | matched: {matched_kw}")

    return score


def suggest_improvements(score: SkillScore) -> list[str]:
    """description 개선 제안을 생성합니다."""
    suggestions = []

    # False Negative 분석 (트리거되어야 하는데 안 됨)
    fn_queries = [r for r in score.results if r.result_type == "FN"]
    if fn_queries:
        missing_terms = set()
        for r in fn_queries:
            words = re.findall(r'[a-zA-Z가-힣]+', r.query.lower())
            missing_terms.update(words)
        suggestions.append(
            f"FN {len(fn_queries)}건: description에 다음 키워드 추가 고려: "
            f"{', '.join(list(missing_terms)[:5])}"
        )

    # False Positive 분석 (트리거 안 되어야 하는데 됨)
    fp_queries = [r for r in score.results if r.result_type == "FP"]
    if fp_queries:
        over_matching = set()
        for r in fp_queries:
            over_matching.update(r.matched_keywords)
        suggestions.append(
            f"FP {len(fp_queries)}건: 과매칭 키워드: "
            f"{', '.join(list(over_matching)[:5])}. description을 더 구체적으로."
        )

    if score.accuracy >= 0.9:
        suggestions.append("accuracy 90%+ — description이 잘 최적화되어 있음")
    elif score.accuracy >= 0.75:
        suggestions.append("accuracy 75-90% — 일부 키워드 조정 필요")
    else:
        suggestions.append("accuracy <75% — description 대폭 개선 필요")

    return suggestions


def main():
    verbose = "--verbose" in sys.argv
    target_skill = None
    for i, arg in enumerate(sys.argv):
        if arg == "--skill" and i + 1 < len(sys.argv):
            target_skill = sys.argv[i + 1]

    # 트리거 쿼리 로드
    queries_path = Path(__file__).parent / "trigger-queries.json"
    if not queries_path.exists():
        print(f"Error: {queries_path} not found")
        sys.exit(1)

    with open(queries_path) as f:
        data = json.load(f)

    skills = data["skills"]
    if target_skill:
        if target_skill not in skills:
            print(f"Error: skill '{target_skill}' not found")
            sys.exit(1)
        skills = {target_skill: skills[target_skill]}

    # 평가 실행
    all_scores: list[SkillScore] = []
    print("=" * 70)
    print("Skill Description Trigger Accuracy Report")
    print("=" * 70)

    for skill_id, skill_data in skills.items():
        print(f"\n## {skill_id}")
        if verbose:
            print(f"   Keywords: {extract_keywords(skill_data['current_description'])[:10]}...")
        score = evaluate_skill(skill_id, skill_data, verbose=verbose)
        all_scores.append(score)

        print(f"   Accuracy: {score.accuracy:.1%} | Precision: {score.precision:.1%} | "
              f"Recall: {score.recall:.1%} | F1: {score.f1:.1%}")
        print(f"   TP={score.tp} TN={score.tn} FP={score.fp} FN={score.fn}")

        for suggestion in suggest_improvements(score):
            print(f"   -> {suggestion}")

    # 종합 요약
    if len(all_scores) > 1:
        print("\n" + "=" * 70)
        print("Summary")
        print("=" * 70)
        total_correct = sum(s.tp + s.tn for s in all_scores)
        total_queries = sum(s.total for s in all_scores)
        avg_accuracy = total_correct / total_queries if total_queries > 0 else 0
        avg_f1 = sum(s.f1 for s in all_scores) / len(all_scores)

        print(f"\n  Overall Accuracy: {avg_accuracy:.1%}")
        print(f"  Average F1: {avg_f1:.2f}")
        print(f"  Total Queries: {total_queries}")

        # 스킬별 순위
        print("\n  Ranking (by F1):")
        ranked = sorted(all_scores, key=lambda s: s.f1, reverse=True)
        for i, s in enumerate(ranked, 1):
            status = "OK" if s.f1 >= 0.85 else "IMPROVE" if s.f1 >= 0.70 else "CRITICAL"
            print(f"  {i}. [{status}] {s.skill_id}: F1={s.f1:.2f} "
                  f"(Acc={s.accuracy:.0%} P={s.precision:.0%} R={s.recall:.0%})")

    # 결과 JSON 저장
    output = {
        "date": "2026-03-31",
        "total_queries": sum(s.total for s in all_scores),
        "overall_accuracy": total_correct / total_queries if total_queries > 0 else 0,
        "average_f1": sum(s.f1 for s in all_scores) / len(all_scores),
        "skills": {}
    }
    for s in all_scores:
        output["skills"][s.skill_id] = {
            "accuracy": round(s.accuracy, 3),
            "precision": round(s.precision, 3),
            "recall": round(s.recall, 3),
            "f1": round(s.f1, 3),
            "tp": s.tp, "tn": s.tn, "fp": s.fp, "fn": s.fn,
            "suggestions": suggest_improvements(s),
        }

    output_path = Path(__file__).parent / "description-accuracy.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\n  Results saved to: {output_path}")


if __name__ == "__main__":
    main()
