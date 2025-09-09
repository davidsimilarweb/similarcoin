#!/usr/bin/env zsh

SESSION="extension-beta"
DIR="/Users/xmedavid/dev/extension-beta"

if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux new-session -d -s "$SESSION" -n term -c "$DIR"
  tmux send-keys -t "$SESSION":0 "cd \"$DIR\"" C-m
  tmux send-keys -t "$SESSION":0 "clear" C-m
  tmux new-window -t "$SESSION":1 -n nvim -c "$DIR"
  tmux send-keys -t "$SESSION":1 'nvim .' C-m
fi

tmux select-window -t "$SESSION":0
