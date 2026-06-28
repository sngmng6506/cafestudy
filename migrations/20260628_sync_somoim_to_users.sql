-- Backfill users from somoim_members so somoim_members.id is a valid user_id FK
INSERT INTO users (id, oauth_provider, nickname, avatar, total_points)
SELECT id, 'somoim', name, NULL, 0
FROM somoim_members
ON CONFLICT (id) DO NOTHING;
