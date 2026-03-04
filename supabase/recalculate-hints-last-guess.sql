-- Recalculate hint_score_before_solve using only the last guess before the winning row.
-- Rule: green = 1, yellow = 0.5
--
-- By default this updates solved submissions in all leagues.
-- To target a single league only, uncomment the league_code filter.

update public.submissions
set hint_score_before_solve = round(
  (
    (
      char_length(attempt_rows[attempts_used - 1])
      - char_length(replace(attempt_rows[attempts_used - 1], '🟩', ''))
    )::numeric
    + (
      (
        char_length(attempt_rows[attempts_used - 1])
        - char_length(replace(attempt_rows[attempts_used - 1], '🟨', ''))
      )::numeric * 0.5
    )
  ),
  2
)
where solved = true
  and attempts_used is not null
  and attempts_used > 1
  -- and league_code = 'WORDLE-PETANQUE'
;

-- Solved in 1 try means no previous guess, so tie-break hint score is 0.
update public.submissions
set hint_score_before_solve = 0
where solved = true
  and (attempts_used = 1)
  -- and league_code = 'WORDLE-PETANQUE'
;

-- Optional quick check:
-- select league_code, puzzle_number, player_id, attempts_used, hint_score_before_solve
-- from public.submissions
-- where league_code = 'WORDLE-PETANQUE'
-- order by puzzle_number desc, attempts_used asc;
