import os
from pathlib import Path

from app.storage.idea_workspace import create_idea_folder, save_idea_yaml
from app.storage.yaml_io import get_all_idea_files


def test_workspace_files_empty_folder(patch_config):
    create_idea_folder('IDEA-2000')
    save_idea_yaml('IDEA-2000', 'idea.yaml', {'idea_id': 'IDEA-2000'})
    files = get_all_idea_files('IDEA-2000')
    assert [f['path'] for f in files] == ['idea.yaml']


def test_workspace_files_with_files(patch_config):
    folder = Path(patch_config) / 'ideas' / 'IDEA-2001'
    create_idea_folder('IDEA-2001')
    (folder / 'notes.txt').write_text('hello', encoding='utf-8')
    save_idea_yaml('IDEA-2001', 'idea.yaml', {'idea_id': 'IDEA-2001'})
    files = get_all_idea_files('IDEA-2001')
    assert {f['path'] for f in files} == {'idea.yaml', 'notes.txt'}


def test_workspace_files_binary_files(patch_config):
    folder = Path(patch_config) / 'ideas' / 'IDEA-2002'
    create_idea_folder('IDEA-2002')
    (folder / 'blob.bin').write_bytes(b'\x00\x01\x02')
    save_idea_yaml('IDEA-2002', 'idea.yaml', {'idea_id': 'IDEA-2002'})
    files = get_all_idea_files('IDEA-2002')
    blob = next(f for f in files if f['path'] == 'blob.bin')
    assert blob['content']


def test_workspace_files_nested_directories(patch_config):
    folder = Path(patch_config) / 'ideas' / 'IDEA-2003'
    create_idea_folder('IDEA-2003')
    nested = folder / 'nested'
    nested.mkdir()
    (nested / 'deep.txt').write_text('deep', encoding='utf-8')
    save_idea_yaml('IDEA-2003', 'idea.yaml', {'idea_id': 'IDEA-2003'})
    files = get_all_idea_files('IDEA-2003')
    assert 'nested/deep.txt' in {f['path'] for f in files}


def test_workspace_transaction_rollback_existing_folder(patch_config):
    from app.storage.idea_workspace import workspace_transaction, save_comment, load_comments
    idea_id = 'IDEA-3000'
    create_idea_folder(idea_id)
    save_comment(idea_id, 'Alice', 'First comment')

    initial_comments = load_comments(idea_id)
    assert len(initial_comments) == 1

    try:
        with workspace_transaction(idea_id):
            save_comment(idea_id, 'Bob', 'Second comment')
            raise RuntimeError('Simulated failure mid-operation')
    except RuntimeError:
        pass

    comments_after_failure = load_comments(idea_id)
    assert comments_after_failure == initial_comments


def test_workspace_transaction_rollback_new_folder(patch_config):
    from app.storage.idea_workspace import workspace_transaction, idea_folder_path
    idea_id = 'IDEA-3001'
    folder = idea_folder_path(idea_id)
    assert not os.path.exists(folder)

    try:
        with workspace_transaction(idea_id):
            os.makedirs(folder, exist_ok=True)
            (Path(folder) / 'partial.txt').write_text('incomplete', encoding='utf-8')
            raise RuntimeError('Simulated failure during creation')
    except RuntimeError:
        pass

    assert not os.path.exists(folder)
