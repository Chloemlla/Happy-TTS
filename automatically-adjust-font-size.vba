Sub BatchChangeFontSize()
    Dim rng As Range
    Dim shp As Shape

    Application.ScreenUpdating = False ' 关闭屏幕刷新以提高运行速度

    ' 1. 处理正文及所有主要区域（包括页眉、页脚、脚注等）
    For Each rng In ActiveDocument.StoryRanges
        Do
            With rng.Find
                .ClearFormatting
                .Font.Name = "Times New Roman"
                .Font.Size = 10.5
                .Text = ""

                .Replacement.ClearFormatting
                .Replacement.Font.Name = "Times New Roman"
                .Replacement.Font.Size = 12
                .Replacement.Text = ""

                .Forward = True
                .Wrap = wdFindStop
                .Format = True
                .MatchCase = False
                .MatchWholeWord = False
                .MatchWildcards = False
                .MatchSoundsLike = False
                .MatchAllWordForms = False

                .Execute Replace:=wdReplaceAll
            End With
            Set rng = rng.NextStoryRange
        Loop Until rng Is Nothing
    Next rng

    ' 2. 处理独立文本框中的文字
    For Each shp In ActiveDocument.Shapes
        If shp.TextFrame.HasText Then
            With shp.TextFrame.TextRange.Find
                .ClearFormatting
                .Font.Name = "Times New Roman"
                .Font.Size = 10.5
                .Text = ""

                .Replacement.ClearFormatting
                .Replacement.Font.Name = "Times New Roman"
                .Replacement.Font.Size = 12
                .Replacement.Text = ""

                .Execute Replace:=wdReplaceAll
            End With
        End If
    Next shp

    Application.ScreenUpdating = True
    MsgBox "调整完成！所有 Times New Roman 10.5磅 的文字已更改为 12磅。", vbInformation, "完成提示"
End Sub
