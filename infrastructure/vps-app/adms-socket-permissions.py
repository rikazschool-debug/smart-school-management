#!/usr/bin/env python3
"""nginx ExecStartPost: grant only the existing bridge group access to its fixed receiver."""
import os,pathlib,stat,pwd
target=pathlib.Path('/run/rikaz-adms/receiver.sock')
metadata=target.lstat()
if not stat.S_ISSOCK(metadata.st_mode) or target.parent.is_symlink():
    raise SystemExit('Refused unexpected receiver socket')
os.chown(target,pwd.getpwnam('www-data').pw_uid,10001)
os.chmod(target,0o660)
