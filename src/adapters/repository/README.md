# Repository adapter boundary

Stage 1 implements the only module allowed to open or mutate the two canonical
requirement files. Application services depend on the `Repository` port and no
transport accepts a filesystem path. Direct filesystem use outside this folder,
operator tooling, migrations, and narrowly scoped build scripts fails CI.
