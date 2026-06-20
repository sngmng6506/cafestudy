INSERT INTO users (id, oauth_provider, nickname, avatar, total_points)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'demo',
  'Demo User',
  NULL,
  0
)
ON CONFLICT (id) DO NOTHING;
