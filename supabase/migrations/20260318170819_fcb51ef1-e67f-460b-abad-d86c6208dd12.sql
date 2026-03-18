UPDATE observacoes 
SET categoria_id = 'd4cab50b-ac0c-430b-a550-951de2e5b131'
WHERE descricao = 'Aguardando Liberação de PT' 
AND categoria_id = '92c1d98a-2d55-4ff1-85f0-2f62f97927b2'
AND deleted_at IS NULL;